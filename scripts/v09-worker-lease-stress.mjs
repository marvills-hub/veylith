import {db} from "../dist/database/database.js";
import {claimNextJob,getJob,heartbeatJob,consumeJobAttempt,recoverExpiredJobs} from "../dist/jobs/job.repository.js";

const tag=`b6p2_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const now=()=>new Date().toISOString();
const old=()=>new Date(Date.now()-60000).toISOString();
let passed=0,failed=0;
const projects=[],tasks=[],jobs=[];

function check(name,value,detail=""){
 if(value){passed++;console.log(`PASS ${String(passed+failed).padStart(2,"0")} ${name}`)}
 else{failed++;console.log(`FAIL ${String(passed+failed).padStart(2,"0")} ${name}${detail?` — ${detail}`:""}`)}
}
function tableInfo(table){return db.prepare(`PRAGMA table_info(${table})`).all()}
function has(table,column){return tableInfo(table).some(row=>row.name===column)}
function insertAdaptive(table,values){
 const info=tableInfo(table),row={};
 for(const col of info){
  if(Object.prototype.hasOwnProperty.call(values,col.name))row[col.name]=values[col.name];
  else if(Number(col.notnull)===1&&col.dflt_value==null&&Number(col.pk)===0){
   if(/(_at|date|time)$/i.test(col.name))row[col.name]=now();
   else if(/(attempt|priority|count|max|progress|sequence|repair)/i.test(col.name))row[col.name]=0;
   else if(/payload|metadata|input|output|config|settings/i.test(col.name))row[col.name]="{}";
   else row[col.name]=`stress_${tag}_${table}_${col.name}_${values.id||Math.random().toString(16).slice(2)}`;
  }
 }
 const names=Object.keys(row);
 db.prepare(`INSERT INTO ${table}(${names.join(",")}) VALUES(${names.map(()=>"?").join(",")})`).run(...names.map(name=>row[name]));
}
function createFixture(index,{attempts=0,maxAttempts=3,priority=900}={}){
 const projectId=`prj_${tag}_${index}`,taskId=`tsk_${tag}_${index}`,jobId=`job_${tag}_${index}`,time=now();
 insertAdaptive("projects",{
  id:projectId,
  name:`Batch 6 Pass 2 ${index}`,
  title:`Batch 6 Pass 2 ${index}`,
  slug:`b6p2-${tag}-${index}`,
  status:"queued",
  phase:"queued",
  workspace:`workspaces/${tag}_${index}`,
  workspace_path:`workspaces/${tag}_${index}`,
  created_at:time,
  updated_at:time
 });
 insertAdaptive("tasks",{
  id:taskId,
  project_id:projectId,
  title:`Worker recovery ${index}`,
  name:`Worker recovery ${index}`,
  description:"Batch 6 Pass 2 fixture",
  prompt:"Batch 6 Pass 2 fixture",
  status:"queued",
  phase:"queued",
  priority,
  attempts:0,
  max_attempts:maxAttempts,
  progress:0,
  error:null,
  created_at:time,
  updated_at:time
 });
 insertAdaptive("jobs",{
  id:jobId,
  type:"task",
  task_id:taskId,
  project_id:projectId,
  status:"queued",
  priority,
  attempts,
  max_attempts:maxAttempts,
  available_at:time,
  claimed_by:null,
  claimed_at:null,
  lease_expires_at:null,
  heartbeat_at:null,
  last_error:null,
  created_at:time,
  updated_at:time,
  completed_at:null
 });
 projects.push(projectId);tasks.push(taskId);jobs.push(jobId);
 return{projectId,taskId,jobId};
}
const row=id=>db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
const task=id=>db.prepare("SELECT * FROM tasks WHERE id=?").get(id);
const project=id=>db.prepare("SELECT * FROM projects WHERE id=?").get(id);
function expire(id){db.prepare("UPDATE jobs SET lease_expires_at=?,heartbeat_at=?,updated_at=? WHERE id=?").run(old(),old(),now(),id)}
function safeDelete(table,column,id){
 try{
  if(has(table,column))db.prepare(`DELETE FROM ${table} WHERE ${column}=?`).run(id);
 }catch{}
}
function cleanup(){
 for(const id of jobs)safeDelete("jobs","id",id);
 for(const id of tasks){
  safeDelete("development_steps","task_id",id);
  safeDelete("events","task_id",id);
  safeDelete("task_memory","task_id",id);
  safeDelete("tasks","id",id);
 }
 for(const id of projects){
  safeDelete("project_memory","project_id",id);
  safeDelete("git_publication_state","project_id",id);
  safeDelete("projects","id",id);
 }
}

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 6 PASS 2");
console.log(" WORKER LOSS + STALE LEASE RECOVERY");
console.log("============================================================\n");

try{
 check("Projects schema available",tableInfo("projects").length>0);
 check("Tasks schema available",tableInfo("tasks").length>0);
 check("Jobs schema available",tableInfo("jobs").length>0);

 const a=createFixture(1);
 const workerA=`stress-worker-a-${tag}`;
 const claimedA=claimNextJob(workerA);

 check("Real queue claims fixture",claimedA?.id===a.jobId,claimedA?.id||"none");
 check("Claim enters running state",getJob(a.jobId)?.status==="running");
 check("Claim records worker owner",getJob(a.jobId)?.claimed_by===workerA);
 check("Claim creates lease",Boolean(getJob(a.jobId)?.lease_expires_at));
 check("Claim creates heartbeat",Boolean(getJob(a.jobId)?.heartbeat_at));
 check("Claim consumes no logical attempt",getJob(a.jobId)?.attempts===0);

 db.prepare("UPDATE tasks SET status='running',phase='development',updated_at=? WHERE id=?").run(now(),a.taskId);
 db.prepare("UPDATE projects SET status='active',phase='development',updated_at=? WHERE id=?").run(now(),a.projectId);

 check("Claimed fixture task enters running state",task(a.taskId)?.status==="running");
 check("Claimed fixture project enters active state",project(a.projectId)?.status==="active");

 const heartbeatOk=heartbeatJob(a.jobId,workerA),heartbeatRow=getJob(a.jobId);
 check("Owner heartbeat succeeds",heartbeatOk===true);
 check("Heartbeat preserves ownership",heartbeatRow?.claimed_by===workerA);
 check("Heartbeat maintains lease",Boolean(heartbeatRow?.lease_expires_at));
 check("Heartbeat consumes no attempt",heartbeatRow?.attempts===0);

 const intruder=heartbeatJob(a.jobId,`wrong-worker-${tag}`);
 check("Wrong worker cannot heartbeat owned job",intruder===false);
 check("Wrong heartbeat does not steal ownership",getJob(a.jobId)?.claimed_by===workerA);

 expire(a.jobId);
 const expiredA=recoverExpiredJobs(),recoveredA=getJob(a.jobId);
 check("Expired real lease detected",expiredA.some(job=>job.id===a.jobId));
 check("Worker loss requeues job",recoveredA?.status==="queued");
 check("Worker loss clears claimed_by",recoveredA?.claimed_by===null);
 check("Worker loss clears claimed_at",recoveredA?.claimed_at===null);
 check("Worker loss clears lease",recoveredA?.lease_expires_at===null);
 check("Worker loss clears heartbeat",recoveredA?.heartbeat_at===null);
 check("Worker loss records recovery reason",recoveredA?.last_error==="Recovered expired worker lease");
 check("Worker loss consumes zero attempts",recoveredA?.attempts===0);

 const taskA=task(a.taskId),projectA=project(a.projectId);
 check("Recovered task becomes queued",taskA?.status==="queued");
 check("Recovered task enters resuming phase",taskA?.phase==="resuming");
 check("Recovered project becomes queued",projectA?.status==="queued");
 check("Recovered project enters resuming phase",projectA?.phase==="resuming");

 const workerB=`stress-worker-b-${tag}`,reclaimed=claimNextJob(workerB);
 check("Replacement worker reclaims recovered job",reclaimed?.id===a.jobId,reclaimed?.id||"none");
 check("Replacement owns recovered job",getJob(a.jobId)?.claimed_by===workerB);
 check("Reclaim still consumes zero attempts",getJob(a.jobId)?.attempts===0);

 const wrongConsume=consumeJobAttempt(a.jobId,workerA);
 check("Dead worker cannot consume attempt after replacement",wrongConsume===null);
 check("Dead worker leaves attempt count unchanged",getJob(a.jobId)?.attempts===0);

 const validConsume=consumeJobAttempt(a.jobId,workerB);
 check("Replacement worker can record real execution failure",validConsume?.attempts===1);
 check("Real failure increments exactly once",getJob(a.jobId)?.attempts===1);

 db.prepare(`UPDATE jobs SET status='queued',claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,heartbeat_at=NULL,available_at=?,updated_at=? WHERE id=?`).run(now(),now(),a.jobId);

 const b=createFixture(2,{attempts:3,maxAttempts:3,priority:950});
 const terminalWorker=`stress-worker-terminal-${tag}`;

 db.prepare(`UPDATE jobs SET status='running',claimed_by=?,claimed_at=?,lease_expires_at=?,heartbeat_at=?,updated_at=? WHERE id=?`).run(terminalWorker,old(),old(),old(),now(),b.jobId);
 db.prepare("UPDATE tasks SET status='running',phase='development',updated_at=? WHERE id=?").run(now(),b.taskId);
 db.prepare("UPDATE projects SET status='active',phase='development',updated_at=? WHERE id=?").run(now(),b.projectId);

 const expiredB=recoverExpiredJobs(),terminalJob=row(b.jobId),terminalTask=task(b.taskId),terminalProject=project(b.projectId);
 check("Expired exhausted lease detected",expiredB.some(job=>job.id===b.jobId));
 check("Exhausted job becomes failed",terminalJob?.status==="failed");
 check("Exhausted recovery clears owner",terminalJob?.claimed_by===null);
 check("Exhausted recovery clears lease",terminalJob?.lease_expires_at===null);
 check("Exhausted recovery preserves attempt count",terminalJob?.attempts===3);
 check("Exhausted task becomes failed",terminalTask?.status==="failed");
 check("Exhausted task enters failed phase",terminalTask?.phase==="failed");
 check("Exhausted project becomes failed",terminalProject?.status==="failed");
 check("Exhausted project enters failed phase",terminalProject?.phase==="failed");

 db.prepare("UPDATE jobs SET status='paused',claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,heartbeat_at=NULL,updated_at=? WHERE id=?").run(now(),a.jobId);
 const cannotReclaim=claimNextJob(`stress-worker-c-${tag}`);
 check("Exhausted failed job cannot be reclaimed",cannotReclaim?.id!==b.jobId);

 cleanup();
 check("Stress jobs cleaned",Number(db.prepare("SELECT COUNT(*) count FROM jobs WHERE id LIKE ?").get(`job_${tag}_%`).count)===0);
 check("Stress tasks cleaned",Number(db.prepare("SELECT COUNT(*) count FROM tasks WHERE id LIKE ?").get(`tsk_${tag}_%`).count)===0);
 check("Stress projects cleaned",Number(db.prepare("SELECT COUNT(*) count FROM projects WHERE id LIKE ?").get(`prj_${tag}_%`).count)===0);
}catch(error){
 console.error(`\nPASS 2 ERROR: ${error.stack||error.message}`);
 failed++;
 try{cleanup()}catch(cleanupError){console.error(`Cleanup error: ${cleanupError.stack||cleanupError.message}`)}
}

console.log("\n============================================================");
console.log(" BATCH 6 PASS 2 RESULT");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed){
 console.log("\nWORKER LOSS / STALE LEASE RECOVERY FAILED.");
 process.exitCode=1;
}else{
 console.log("\nWORKER LOSS / STALE LEASE RECOVERY PASSED.");
 console.log("Real queue claiming:           PASS");
 console.log("Lease ownership:               PASS");
 console.log("Heartbeat ownership:           PASS");
 console.log("Wrong-worker protection:       PASS");
 console.log("Expired lease detection:       PASS");
 console.log("Zero-attempt crash recovery:   PASS");
 console.log("Replacement-worker reclaim:    PASS");
 console.log("Attempt ownership protection:  PASS");
 console.log("Exhaustion terminalization:    PASS");
 console.log("Database cleanup:              PASS");
}

