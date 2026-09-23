import {db} from "../dist/database/database.js";
import {
 claimNextJob,getJob,completeJob,consumeJobAttempt,
 pauseJob,resumeJob,requeueJob,cancelJob,recoverExpiredJobs
} from "../dist/jobs/job.repository.js";

const tag=`b6p6_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const TOTAL=240;
const CYCLES=40;
let passed=0,failed=0;
const fixtures=[];

function check(name,value,detail=""){
 const n=++check.n;
 if(value){passed++;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`)}
 else{failed++;console.log(`FAIL ${String(n).padStart(2,"0")} ${name}${detail?` — ${detail}`:""}`)}
}
check.n=0;
function now(){return new Date().toISOString()}
function columns(table){return db.prepare(`PRAGMA table_info(${table})`).all()}
function has(table,column){return columns(table).some(c=>c.name===column)}
function count(sql,...args){return Number(db.prepare(sql).get(...args)?.count||0)}
function insertAdaptive(table,values){
 const row={};
 for(const col of columns(table)){
  if(Object.prototype.hasOwnProperty.call(values,col.name))row[col.name]=values[col.name];
  else if(col.pk)continue;
  else if(col.notnull&&!col.dflt_value){
   const n=col.name.toLowerCase();
   if(n.includes("created")||n.includes("updated")||n.endsWith("_at"))row[col.name]=now();
   else if(n.includes("attempt")||n.includes("priority")||n.includes("count")||n.includes("sequence")||n.includes("repair"))row[col.name]=0;
   else if(n.includes("payload")||n.includes("metadata")||n.includes("input")||n.includes("output")||n.includes("config")||n.includes("settings"))row[col.name]="{}";
   else row[col.name]=`${tag}_${table}_${col.name}_${values.id||Math.random().toString(16).slice(2)}`;
  }
 }
 const keys=Object.keys(row);
 db.prepare(`INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(()=>"?").join(",")})`).run(...keys.map(k=>row[k]));
}
function fixture(index){
 const projectId=`${tag}_prj_${String(index).padStart(3,"0")}`;
 const taskId=`${tag}_tsk_${String(index).padStart(3,"0")}`;
 const jobId=`${tag}_job_${String(index).padStart(3,"0")}`;
 const t=now();
 insertAdaptive("projects",{id:projectId,name:`B6P6 ${index}`,slug:`${tag}-p-${index}`,status:"queued",phase:"queued",created_at:t,updated_at:t});
 insertAdaptive("tasks",{id:taskId,project_id:projectId,name:`B6P6 Task ${index}`,prompt:"Synthetic endurance fixture",status:"queued",phase:"queued",priority:TOTAL-index,attempts:0,max_attempts:3,repairs:0,created_at:t,updated_at:t});
 insertAdaptive("jobs",{id:jobId,type:"task",task_id:taskId,project_id:projectId,status:"queued",priority:TOTAL-index,attempts:0,max_attempts:3,available_at:t,created_at:t,updated_at:t});
 const f={index,projectId,taskId,jobId};
 fixtures.push(f);
 return f;
}
function job(f){return getJob(f.jobId)}
function setTask(f,status,phase=status){
 db.prepare("UPDATE tasks SET status=?,phase=?,updated_at=? WHERE id=?").run(status,phase,now(),f.taskId);
}
function setProject(f,status,phase=status){
 db.prepare("UPDATE projects SET status=?,phase=?,updated_at=? WHERE id=?").run(status,phase,now(),f.projectId);
}
function activate(f){
 setTask(f,"running","development");
 setProject(f,"active","development");
}
function finish(f){
 const t=now();
 if(has("tasks","completed_at"))db.prepare("UPDATE tasks SET status='completed',phase='completed',completed_at=?,updated_at=? WHERE id=?").run(t,t,f.taskId);
 else db.prepare("UPDATE tasks SET status='completed',phase='completed',updated_at=? WHERE id=?").run(t,f.taskId);
 setProject(f,"completed","completed");
}
function pauseState(f){setTask(f,"paused","paused");setProject(f,"paused","paused")}
function queuedState(f,phase="resuming"){setTask(f,"queued",phase);setProject(f,"queued",phase)}
function cancelState(f){
 const t=now();
 if(has("tasks","completed_at"))db.prepare("UPDATE tasks SET status='cancelled',phase='cancelled',completed_at=?,updated_at=? WHERE id=?").run(t,t,f.taskId);
 else db.prepare("UPDATE tasks SET status='cancelled',phase='cancelled',updated_at=? WHERE id=?").run(t,f.taskId);
 setProject(f,"cancelled","cancelled");
}
function expire(f){
 db.prepare("UPDATE jobs SET lease_expires_at=? WHERE id=?").run(new Date(Date.now()-5000).toISOString(),f.jobId);
}
function claimExpected(f,worker){
 const claimed=claimNextJob(worker);
 if(!claimed||claimed.id!==f.jobId)return null;
 activate(f);
 return claimed;
}
function cleanup(){
 for(const f of fixtures){
  for(const table of ["development_steps","events","memory"]){
   try{
    if(has(table,"task_id"))db.prepare(`DELETE FROM ${table} WHERE task_id=?`).run(f.taskId);
    if(has(table,"project_id"))db.prepare(`DELETE FROM ${table} WHERE project_id=?`).run(f.projectId);
   }catch{}
  }
  try{db.prepare("DELETE FROM worker_slots WHERE job_id=? OR task_id=? OR project_id=?").run(f.jobId,f.taskId,f.projectId)}catch{}
  try{db.prepare("DELETE FROM jobs WHERE id=?").run(f.jobId)}catch{}
  try{db.prepare("DELETE FROM tasks WHERE id=?").run(f.taskId)}catch{}
  try{db.prepare("DELETE FROM projects WHERE id=?").run(f.projectId)}catch{}
 }
}

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 6 PASS 6");
console.log(" MIXED WORKLOAD ENDURANCE + DATABASE INTEGRITY");
console.log("============================================================");
console.log(`Synthetic jobs: ${TOTAL}`);
console.log(`Mixed cycles: ${CYCLES}`);
console.log("Execution model: bounded sequential waves");
console.log("External AI calls: NONE");
console.log("GitHub calls: NONE\n");

try{
 console.log("--- FIXTURE CREATION ---");
 for(let i=1;i<=TOTAL;i++)fixture(i);
 check("240 projects persisted",count("SELECT COUNT(*) count FROM projects WHERE id LIKE ?",`${tag}_prj_%`)===TOTAL);
 check("240 tasks persisted",count("SELECT COUNT(*) count FROM tasks WHERE id LIKE ?",`${tag}_tsk_%`)===TOTAL);
 check("240 jobs persisted",count("SELECT COUNT(*) count FROM jobs WHERE id LIKE ?",`${tag}_job_%`)===TOTAL);
 check("All jobs begin queued",count("SELECT COUNT(*) count FROM jobs WHERE id LIKE ? AND status='queued'",`${tag}_job_%`)===TOTAL);
 check("All jobs begin with zero attempts",count("SELECT COUNT(*) count FROM jobs WHERE id LIKE ? AND attempts=0",`${tag}_job_%`)===TOTAL);

 console.log("\n--- 40 MIXED ENDURANCE CYCLES ---");
 let completed=0,paused=0,cancelled=0,crashed=0,retried=0,doubleRetried=0;

 for(let cycle=0;cycle<CYCLES;cycle++){
  const base=cycle*6;
  const group=fixtures.slice(base,base+6);

  const normal=group[0];
  const pause=group[1];
  const cancel=group[2];
  const crash=group[3];
  const retry=group[4];
  const retry2=group[5];

  let worker=`${tag}_c${cycle}_normal`;
  let c=claimExpected(normal,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: normal claim failed`);
  completeJob(normal.jobId,worker);
  finish(normal);
  completed++;

  worker=`${tag}_c${cycle}_pause1`;
  c=claimExpected(pause,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: pause claim failed`);
  pauseJob(pause.jobId,"B6P6 endurance pause");
  pauseState(pause);
  if(job(pause)?.attempts!==0)throw new Error(`Cycle ${cycle+1}: pause consumed attempt`);
  resumeJob(pause.jobId);
  queuedState(pause,"resuming");
  worker=`${tag}_c${cycle}_pause2`;
  c=claimExpected(pause,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: resumed claim failed`);
  completeJob(pause.jobId,worker);
  finish(pause);
  paused++;

  worker=`${tag}_c${cycle}_cancel`;
  c=claimExpected(cancel,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: cancel claim failed`);
  cancelJob(cancel.jobId,"B6P6 endurance cancel");
  cancelState(cancel);
  if(job(cancel)?.attempts!==0)throw new Error(`Cycle ${cycle+1}: cancel consumed attempt`);
  cancelled++;

  worker=`${tag}_c${cycle}_crash1`;
  c=claimExpected(crash,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: crash claim failed`);
  expire(crash);
  recoverExpiredJobs();
  if(job(crash)?.status!=="queued"||job(crash)?.attempts!==0||job(crash)?.claimed_by!=null)throw new Error(`Cycle ${cycle+1}: crash recovery invariant failed`);
  worker=`${tag}_c${cycle}_crash2`;
  c=claimExpected(crash,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: crash reclaim failed`);
  completeJob(crash.jobId,worker);
  finish(crash);
  crashed++;

  worker=`${tag}_c${cycle}_retry1`;
  c=claimExpected(retry,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: retry claim failed`);
  if(!consumeJobAttempt(retry.jobId,worker))throw new Error(`Cycle ${cycle+1}: failure attempt rejected`);
  requeueJob(retry.jobId,0,"B6P6 execution failure");
  queuedState(retry,"retrying");
  worker=`${tag}_c${cycle}_retry2`;
  c=claimExpected(retry,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: retry reclaim failed`);
  completeJob(retry.jobId,worker);
  finish(retry);
  if(job(retry)?.attempts!==1)throw new Error(`Cycle ${cycle+1}: retry attempt accounting failed`);
  retried++;

  worker=`${tag}_c${cycle}_double1`;
  c=claimExpected(retry2,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: double retry first claim failed`);
  if(!consumeJobAttempt(retry2.jobId,worker))throw new Error(`Cycle ${cycle+1}: double retry first attempt rejected`);
  requeueJob(retry2.jobId,0,"B6P6 first execution failure");
  queuedState(retry2,"retrying");

  worker=`${tag}_c${cycle}_double2`;
  c=claimExpected(retry2,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: double retry second claim failed`);
  if(!consumeJobAttempt(retry2.jobId,worker))throw new Error(`Cycle ${cycle+1}: double retry second attempt rejected`);
  requeueJob(retry2.jobId,0,"B6P6 second execution failure");
  queuedState(retry2,"retrying");

  worker=`${tag}_c${cycle}_double3`;
  c=claimExpected(retry2,worker);
  if(!c)throw new Error(`Cycle ${cycle+1}: double retry final claim failed`);
  completeJob(retry2.jobId,worker);
  finish(retry2);
  if(job(retry2)?.attempts!==2)throw new Error(`Cycle ${cycle+1}: double retry attempt accounting failed`);
  doubleRetried++;

  if((cycle+1)%10===0)console.log(`INFO Completed ${cycle+1}/${CYCLES} mixed cycles`);
 }

 check("40 normal completion paths executed",completed===40);
 check("40 pause/resume paths executed",paused===40);
 check("40 cancellation paths executed",cancelled===40);
 check("40 worker-loss recovery paths executed",crashed===40);
 check("40 single-failure retry paths executed",retried===40);
 check("40 double-failure retry paths executed",doubleRetried===40);

 console.log("\n--- ENDURANCE RESULT INVARIANTS ---");

 const completedCount=count("SELECT COUNT(*) count FROM jobs WHERE id LIKE ? AND status='completed'",`${tag}_job_%`);
 const cancelledCount=count("SELECT COUNT(*) count FROM jobs WHERE id LIKE ? AND status='cancelled'",`${tag}_job_%`);
 const runningCount=count("SELECT COUNT(*) count FROM jobs WHERE id LIKE ? AND status='running'",`${tag}_job_%`);
 const resumableCount=count("SELECT COUNT(*) count FROM jobs WHERE id LIKE ? AND status IN ('queued','retry_wait','paused')",`${tag}_job_%`);

 check("200 jobs completed",completedCount===200,`completed=${completedCount}`);
 check("40 jobs cancelled",cancelledCount===40,`cancelled=${cancelledCount}`);
 check("No jobs remain running",runningCount===0,`running=${runningCount}`);
 check("No jobs remain stranded/resumable",resumableCount===0,`resumable=${resumableCount}`);

 const terminalOwned=count(`
  SELECT COUNT(*) count FROM jobs
  WHERE id LIKE ?
  AND status IN ('completed','failed','cancelled')
  AND (claimed_by IS NOT NULL OR claimed_at IS NOT NULL OR lease_expires_at IS NOT NULL OR heartbeat_at IS NOT NULL)
 `,`${tag}_job_%`);
 check("Terminal jobs retain no ownership metadata",terminalOwned===0,`invalid=${terminalOwned}`);

 const invalidRunning=count(`
  SELECT COUNT(*) count FROM jobs
  WHERE id LIKE ? AND status='running'
  AND (claimed_by IS NULL OR claimed_at IS NULL OR lease_expires_at IS NULL OR heartbeat_at IS NULL)
 `,`${tag}_job_%`);
 check("No running job lacks ownership metadata",invalidRunning===0,`invalid=${invalidRunning}`);

 const overBudget=count("SELECT COUNT(*) count FROM jobs WHERE id LIKE ? AND attempts>max_attempts",`${tag}_job_%`);
 check("No job exceeds attempt budget",overBudget===0,`invalid=${overBudget}`);

 const cancelAttemptLeak=count("SELECT COUNT(*) count FROM jobs WHERE id LIKE ? AND status='cancelled' AND attempts<>0",`${tag}_job_%`);
 check("Cancellation consumed zero execution attempts",cancelAttemptLeak===0,`invalid=${cancelAttemptLeak}`);

 const retryIds=fixtures.filter((_,i)=>i%6===4);
 const doubleIds=fixtures.filter((_,i)=>i%6===5);
 const crashIds=fixtures.filter((_,i)=>i%6===3);
 const pauseIds=fixtures.filter((_,i)=>i%6===1);

 check("All single-failure jobs retain exactly one attempt",retryIds.every(f=>job(f)?.attempts===1));
 check("All double-failure jobs retain exactly two attempts",doubleIds.every(f=>job(f)?.attempts===2));
 check("All crash-recovered jobs retain zero attempts",crashIds.every(f=>job(f)?.attempts===0));
 check("All pause/resume jobs retain zero attempts",pauseIds.every(f=>job(f)?.attempts===0));

 const duplicateIds=count(`
  SELECT COUNT(*) count FROM (
   SELECT id FROM jobs WHERE id LIKE ? GROUP BY id HAVING COUNT(*)>1
  )
 `,`${tag}_job_%`);
 check("No duplicate job rows",duplicateIds===0,`duplicates=${duplicateIds}`);

 const taskMismatch=count(`
  SELECT COUNT(*) count
  FROM tasks t JOIN jobs j ON j.task_id=t.id
  WHERE j.id LIKE ?
  AND (
   (j.status='completed' AND t.status<>'completed')
   OR
   (j.status='cancelled' AND t.status<>'cancelled')
  )
 `,`${tag}_job_%`);
 check("Task states agree with job terminal states",taskMismatch===0,`mismatches=${taskMismatch}`);

 const projectMismatch=count(`
  SELECT COUNT(*) count
  FROM projects p JOIN jobs j ON j.project_id=p.id
  WHERE j.id LIKE ?
  AND (
   (j.status='completed' AND p.status<>'completed')
   OR
   (j.status='cancelled' AND p.status<>'cancelled')
  )
 `,`${tag}_job_%`);
 check("Project states agree with job terminal states",projectMismatch===0,`mismatches=${projectMismatch}`);

 console.log("\n--- SQLITE INTEGRITY ---");
 const integrity=db.prepare("PRAGMA integrity_check").get();
 check("SQLite integrity_check is ok",String(Object.values(integrity||{})[0]).toLowerCase()==="ok");
 const fk=db.prepare("PRAGMA foreign_key_check").all();
 check("SQLite foreign_key_check is clean",fk.length===0,`violations=${fk.length}`);

 console.log("\n--- CLEANUP ---");
 cleanup();
 check("All endurance jobs cleaned",count("SELECT COUNT(*) count FROM jobs WHERE id LIKE ?",`${tag}_job_%`)===0);
 check("All endurance tasks cleaned",count("SELECT COUNT(*) count FROM tasks WHERE id LIKE ?",`${tag}_tsk_%`)===0);
 check("All endurance projects cleaned",count("SELECT COUNT(*) count FROM projects WHERE id LIKE ?",`${tag}_prj_%`)===0);
 const finalIntegrity=db.prepare("PRAGMA integrity_check").get();
 check("SQLite remains healthy after cleanup",String(Object.values(finalIntegrity||{})[0]).toLowerCase()==="ok");

}catch(error){
 console.error(`\nPASS 6 ERROR: ${error.stack||error.message}`);
 failed++;
 try{cleanup()}catch{}
}

console.log("\n============================================================");
console.log(" BATCH 6 PASS 6 RESULT");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed){
 console.log("\nMIXED WORKLOAD ENDURANCE FAILED.");
 process.exitCode=1;
}else{
 console.log("\nMIXED WORKLOAD ENDURANCE PASSED.");
 console.log("240-job workload:                PASS");
 console.log("40 mixed endurance cycles:       PASS");
 console.log("Completion path:                 PASS");
 console.log("Pause/resume path:               PASS");
 console.log("Cancellation path:               PASS");
 console.log("Worker-loss/reclaim path:        PASS");
 console.log("Single-failure retry path:       PASS");
 console.log("Double-failure retry path:       PASS");
 console.log("Attempt accounting:              PASS");
 console.log("Ownership integrity:             PASS");
 console.log("Task/project consistency:        PASS");
 console.log("SQLite integrity:                PASS");
 console.log("Fixture cleanup:                 PASS");
 console.log("External AI calls:               NONE");
 console.log("GitHub calls:                    NONE");
}
