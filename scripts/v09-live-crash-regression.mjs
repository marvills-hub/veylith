import {spawn} from "node:child_process";
import {once} from "node:events";
import readline from "node:readline";
import {db} from "../dist/database/database.js";
import {WORKER_ID} from "../dist/config/config.js";
import {
 RUNTIME_ID,
 registerRuntime,
 setRuntimeStatus,
 markRuntimeStopped
} from "../dist/runtime/runtime-instance.service.js";
import {recoverJobs} from "../dist/jobs/job-recovery.service.js";
import {claimNextJob} from "../dist/jobs/job.repository.js";

function assert(name,condition,detail=""){
 if(!condition){
  console.error(`FAIL ${name}${detail?` - ${detail}`:""}`);
  process.exitCode=1;
  return false;
 }
 console.log(`PASS ${name}`);
 return true;
}

function sleep(ms){
 return new Promise(resolve=>setTimeout(resolve,ms));
}

const suffix=crypto.randomUUID().replaceAll("-","").slice(0,10);
let fixture=null;
let child=null;

function cleanup(){
 if(!fixture)return;
 try{db.prepare("DELETE FROM jobs WHERE id=?").run(fixture.jobId)}catch{}
 try{db.prepare("DELETE FROM tasks WHERE id=?").run(fixture.taskId)}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(fixture.projectId)}catch{}
 try{
  db.prepare("DELETE FROM worker_slots WHERE instr(id,?)>0")
   .run(`-${fixture.runtimeId}-slot-`);
 }catch{}
 try{
  db.prepare("DELETE FROM runtime_instances WHERE id=?")
   .run(fixture.runtimeId);
 }catch{}
 try{
  db.prepare("DELETE FROM runtime_instances WHERE id=?")
   .run(RUNTIME_ID);
 }catch{}
}

async function waitForChildReady(proc){
 const rl=readline.createInterface({input:proc.stdout});
 return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{
   rl.close();
   reject(new Error("Crash fixture did not become ready"));
  },10000);

  rl.on("line",line=>{
   try{
    const value=JSON.parse(line);
    if(value?.ready){
     clearTimeout(timer);
     rl.close();
     resolve(value);
    }
   }catch{}
  });

  proc.once("exit",code=>{
   clearTimeout(timer);
   rl.close();
   reject(new Error(`Crash fixture exited before ready: ${code}`));
  });
 });
}

async function waitUntilRuntimeStale(runtimeId,timeoutMs=40000){
 const started=Date.now();

 while(Date.now()-started<timeoutMs){
  const runtime=db.prepare(`
   SELECT heartbeat_at
   FROM runtime_instances
   WHERE id=?
  `).get(runtimeId);

  if(!runtime)return false;

  const age=Date.now()-new Date(runtime.heartbeat_at).getTime();

  if(age>=31000)return true;

  await sleep(500);
 }

 return false;
}

try{
 child=spawn(
  process.execPath,
  ["scripts/fixtures/v09-crash-child.mjs"],
  {
   cwd:process.cwd(),
   env:{
    ...process.env,
    VEYLITH_CRASH_FIXTURE:suffix
   },
   stdio:["ignore","pipe","pipe"],
   windowsHide:true
  }
 );

 fixture=await waitForChildReady(child);

 assert(
  "child runtime started",
  fixture?.ready===true
 );

 assert(
  "child has unique runtime",
  fixture.runtimeId!==RUNTIME_ID
 );

 const running=db.prepare(`
  SELECT *
  FROM jobs
  WHERE id=?
 `).get(fixture.jobId);

 assert(
  "child owns running job",
  running?.status==="running"
 );

 assert(
  "job ownership contains child runtime",
  String(running?.claimed_by||"")
   .includes(`-${fixture.runtimeId}-slot-`)
 );

 const childSlot=db.prepare(`
  SELECT *
  FROM worker_slots
  WHERE job_id=?
 `).get(fixture.jobId);

 assert(
  "child owns runtime-specific worker slot",
  !!childSlot
 );

 process.kill(fixture.pid,"SIGKILL");
 await once(child,"exit");

 console.log(
  "PASS child process force-killed without graceful shutdown"
 );

 const heartbeatAfterKill=db.prepare(`
  SELECT heartbeat_at
  FROM runtime_instances
  WHERE id=?
 `).get(fixture.runtimeId);

 await sleep(1500);

 const heartbeatLater=db.prepare(`
  SELECT heartbeat_at
  FROM runtime_instances
  WHERE id=?
 `).get(fixture.runtimeId);

 assert(
  "force-killed runtime heartbeat stopped",
  heartbeatAfterKill?.heartbeat_at===
  heartbeatLater?.heartbeat_at
 );

 console.log(
  "Waiting for production 30-second stale-runtime threshold..."
 );

 const staleReady=await waitUntilRuntimeStale(
  fixture.runtimeId
 );

 assert(
  "runtime exceeded stale heartbeat threshold",
  staleReady
 );

 registerRuntime();
 setRuntimeStatus("online");

 const recovery=recoverJobs();

 const oldRuntime=db.prepare(`
  SELECT *
  FROM runtime_instances
  WHERE id=?
 `).get(fixture.runtimeId);

 const recovered=db.prepare(`
  SELECT *
  FROM jobs
  WHERE id=?
 `).get(fixture.jobId);

 const task=db.prepare(`
  SELECT *
  FROM tasks
  WHERE id=?
 `).get(fixture.taskId);

 const oldSlots=db.prepare(`
  SELECT *
  FROM worker_slots
  WHERE instr(id,?)>0
 `).all(`-${fixture.runtimeId}-slot-`);

 assert(
  "force-killed runtime becomes stale",
  oldRuntime?.status==="stale"
 );

 assert(
  "crashed job reclaimed exactly once",
  recovery.runtime===1
 );

 assert(
  "recovered job is queued",
  recovered?.status==="queued"
 );

 assert(
  "recovered ownership cleared",
  recovered?.claimed_by===null
 );

 assert(
  "recovered lease cleared",
  recovered?.lease_expires_at===null
 );

 assert(
  "recovered task is resumable",
  task?.status==="queued"&&
  task?.phase==="resuming"
 );

 assert(
  "stale runtime worker slots removed",
  oldSlots.length===0
 );

 const owner=`${WORKER_ID}-${RUNTIME_ID}-slot-99`;

 const claimed=claimNextJob(owner);

 assert(
  "replacement runtime can reclaim job",
  claimed?.id===fixture.jobId
 );

 const claimedAgain=claimNextJob(
  `${WORKER_ID}-${RUNTIME_ID}-slot-98`
 );

 assert(
  "job cannot be claimed twice",
  !claimedAgain||
  claimedAgain.id!==fixture.jobId
 );

 const final=db.prepare(`
  SELECT *
  FROM jobs
  WHERE id=?
 `).get(fixture.jobId);

 assert(
  "single active owner remains",
  final?.status==="running"&&
  final?.claimed_by===owner
 );

 if(!process.exitCode){
  console.log("");
  console.log(
   "VEYLITH v0.9 BATCH 1 LIVE CRASH/RESTART TEST PASSED"
  );
 }
}catch(error){
 console.error(error);
 process.exitCode=1;
}finally{
 if(child&&!child.killed){
  try{child.kill("SIGKILL")}catch{}
 }

 try{
  markRuntimeStopped(
   "Live crash regression complete"
  );
 }catch{}

 cleanup();

 try{db.close()}catch{}
}
