import {db} from "../dist/database/database.js";
import {
 claimNextJob,getJob,completeJob,heartbeatJob,consumeJobAttempt,recoverExpiredJobs
} from "../dist/jobs/job.repository.js";
import {
 pauseTask,cancelTaskJob,resumeTaskJob
} from "../dist/jobs/job.service.js";
import {assertTaskRunnable,TaskControlError} from "../dist/core/task-control.service.js";

const tag=`b6p5_${Date.now()}_${Math.random().toString(16).slice(2)}`;
let passed=0,failed=0;
const fixtures=[];

function check(name,value,detail=""){
 if(value){
  passed++;
  console.log(`PASS ${String(passed+failed).padStart(2,"0")} ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${String(passed+failed).padStart(2,"0")} ${name}${detail?` — ${detail}`:""}`);
 }
}
function now(){return new Date().toISOString()}
function info(table){return db.prepare(`PRAGMA table_info(${table})`).all()}
function has(table,column){return info(table).some(c=>c.name===column)}
function insertAdaptive(table,values){
 const columns=info(table),row={};
 for(const col of columns){
  if(Object.prototype.hasOwnProperty.call(values,col.name))row[col.name]=values[col.name];
  else if(col.pk)continue;
  else if(col.notnull&&!col.dflt_value){
   const n=col.name.toLowerCase();
   if(n.includes("created")||n.includes("updated")||n.endsWith("_at"))row[col.name]=now();
   else if(n.includes("attempt")||n.includes("priority")||n.includes("count")||n.includes("progress")||n.includes("sequence")||n.includes("repair"))row[col.name]=0;
   else if(n.includes("payload")||n.includes("metadata")||n.includes("input")||n.includes("output")||n.includes("config")||n.includes("settings"))row[col.name]="{}";
   else row[col.name]=`${tag}_${table}_${col.name}_${values.id||Math.random().toString(16).slice(2)}`;
  }
 }
 const keys=Object.keys(row);
 db.prepare(`INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(()=>"?").join(",")})`).run(...keys.map(k=>row[k]));
}
function row(table,id){return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id)}
function createFixture(index,maxAttempts=3){
 const projectId=`${tag}_prj_${index}`;
 const taskId=`${tag}_tsk_${index}`;
 const jobId=`${tag}_job_${index}`;
 const time=now();
 insertAdaptive("projects",{
  id:projectId,
  name:`Batch 6 Pass 5 ${index}`,
  slug:`${tag}-project-${index}`,
  status:"queued",
  phase:"queued",
  progress:0,
  created_at:time,
  updated_at:time
 });
 insertAdaptive("tasks",{
  id:taskId,
  project_id:projectId,
  name:`Batch 6 Pass 5 Task ${index}`,
  prompt:"Synthetic control-race fixture",
  status:"queued",
  phase:"queued",
  priority:950-index,
  attempts:0,
  max_attempts:maxAttempts,
  repairs:0,
  progress:0,
  created_at:time,
  updated_at:time
 });
 insertAdaptive("jobs",{
  id:jobId,
  type:"task",
  task_id:taskId,
  project_id:projectId,
  status:"queued",
  priority:950-index,
  attempts:0,
  max_attempts:maxAttempts,
  available_at:time,
  created_at:time,
  updated_at:time
 });
 fixtures.push({projectId,taskId,jobId});
 return fixtures.at(-1);
}
function activate(f,worker){
 const claimed=claimNextJob(worker);
 if(!claimed||claimed.id!==f.jobId)return claimed;
 db.prepare("UPDATE tasks SET status='running',phase='development',updated_at=? WHERE id=?").run(now(),f.taskId);
 db.prepare("UPDATE projects SET status='active',phase='development',updated_at=? WHERE id=?").run(now(),f.projectId);
 return claimed;
}
function cleanup(){
 for(const f of fixtures){
  const dependentTables=["development_steps","events","memory"];
  for(const table of dependentTables){
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
function throws(fn){
 try{fn();return false}catch{return true}
}

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 6 PASS 5");
console.log(" CANCELLATION + CONTROL RACE STRESS");
console.log("============================================================");

try{
 console.log("\n--- PAUSE VS ACTIVE WORKER ---");
 const a=createFixture(1);
 const aw="b6p5-worker-pause";
 check("Pause fixture claimed",activate(a,aw)?.id===a.jobId);
 check("Pause fixture owned by worker",getJob(a.jobId)?.claimed_by===aw);
 check("Pause fixture starts with zero attempts",getJob(a.jobId)?.attempts===0);

 pauseTask(a.taskId,"Batch 6 pause race");

 check("Pause moves job to paused",getJob(a.jobId)?.status==="paused");
 check("Pause clears job owner",getJob(a.jobId)?.claimed_by==null);
 check("Pause clears lease",getJob(a.jobId)?.lease_expires_at==null);
 check("Pause clears heartbeat",getJob(a.jobId)?.heartbeat_at==null);
 check("Pause moves task to paused",row("tasks",a.taskId)?.status==="paused");
 check("Pause moves task phase to paused",row("tasks",a.taskId)?.phase==="paused");
 check("Pause moves project to paused",row("projects",a.projectId)?.status==="paused");
 check("Pause consumes zero attempts",getJob(a.jobId)?.attempts===0);
 check("Old worker heartbeat rejected after pause",heartbeatJob(a.jobId,aw)===false);
 check("Old worker cannot consume attempt after pause",consumeJobAttempt(a.jobId,aw)==null);
 check("Old worker completion loses pause race",throws(()=>completeJob(a.jobId,aw)));
 check("Pause remains authoritative after late completion",getJob(a.jobId)?.status==="paused");

 console.log("\n--- RESUME AFTER PAUSE ---");
 const resumedA=resumeTaskJob(a.taskId);
 check("Paused job resumes to queue",resumedA?.status==="queued");
 db.prepare("UPDATE tasks SET status='queued',phase='resuming',updated_at=? WHERE id=?").run(now(),a.taskId);
 db.prepare("UPDATE projects SET status='queued',phase='resuming',updated_at=? WHERE id=?").run(now(),a.projectId);
 const aw2="b6p5-worker-resumed";
 check("Replacement worker claims resumed job",claimNextJob(aw2)?.id===a.jobId);
 check("Resume still preserves attempt budget",getJob(a.jobId)?.attempts===0);
 check("Original worker cannot mutate resumed ownership",consumeJobAttempt(a.jobId,aw)==null);
 check("Replacement worker owns resumed work",getJob(a.jobId)?.claimed_by===aw2);
 pauseTask(a.taskId,"fixture cleanup pause");

 console.log("\n--- CANCEL VS ACTIVE WORKER ---");
 const b=createFixture(2);
 const bw="b6p5-worker-cancel";
 check("Cancel fixture claimed",activate(b,bw)?.id===b.jobId);
 cancelTaskJob(b.taskId,"Batch 6 cancel race");
 check("Cancel moves job to cancelled",getJob(b.jobId)?.status==="cancelled");
 check("Cancel clears job owner",getJob(b.jobId)?.claimed_by==null);
 check("Cancel clears lease",getJob(b.jobId)?.lease_expires_at==null);
 check("Cancel clears heartbeat",getJob(b.jobId)?.heartbeat_at==null);
 check("Cancel moves task to cancelled",row("tasks",b.taskId)?.status==="cancelled");
 check("Cancel moves task phase to cancelled",row("tasks",b.taskId)?.phase==="cancelled");
 check("Cancel moves project to cancelled",row("projects",b.projectId)?.status==="cancelled");
 check("Cancel consumes zero attempts",getJob(b.jobId)?.attempts===0);
 check("Old worker heartbeat rejected after cancel",heartbeatJob(b.jobId,bw)===false);
 check("Old worker cannot consume attempt after cancel",consumeJobAttempt(b.jobId,bw)==null);
 check("Old worker completion loses cancel race",throws(()=>completeJob(b.jobId,bw)));
 check("Cancelled job remains authoritative",getJob(b.jobId)?.status==="cancelled");

 console.log("\n--- REPEATED CANCEL IDEMPOTENCY ---");
 let secondCancelError=false;
 try{cancelTaskJob(b.taskId,"Repeated cancel")}catch{secondCancelError=true}
 check("Repeated cancel cannot resurrect job",getJob(b.jobId)?.status==="cancelled");
 check("Repeated cancel leaves task cancelled",row("tasks",b.taskId)?.status==="cancelled");
 check("Repeated cancel consumes no attempt",getJob(b.jobId)?.attempts===0);
 check("Repeated cancel is stable whether accepted or rejected",secondCancelError||getJob(b.jobId)?.status==="cancelled");

 console.log("\n--- CANCEL VS STALE RECOVERY ---");
 const c=createFixture(3);
 const cw="b6p5-worker-stale";
 check("Stale/cancel fixture claimed",activate(c,cw)?.id===c.jobId);
 db.prepare("UPDATE jobs SET lease_expires_at=? WHERE id=?").run(new Date(Date.now()-5000).toISOString(),c.jobId);
 cancelTaskJob(c.taskId,"Cancel before stale recovery");
 const recoveredAfterCancel=recoverExpiredJobs();
 check("Recovery does not resurrect cancelled job",getJob(c.jobId)?.status==="cancelled");
 check("Cancelled stale job remains unowned",getJob(c.jobId)?.claimed_by==null);
 check("Cancelled stale job preserves zero attempts",getJob(c.jobId)?.attempts===0);
 check("Cancelled task remains cancelled after recovery",row("tasks",c.taskId)?.status==="cancelled");
 check("Cancelled project remains cancelled after recovery",row("projects",c.projectId)?.status==="cancelled");
 check("Expired recovery excludes cancelled job",!recoveredAfterCancel.some?.(x=>x?.id===c.jobId));

 console.log("\n--- COMPLETE VS LATE CONTROL ---");
 const d=createFixture(4);
 const dw="b6p5-worker-complete";
 check("Completion fixture claimed",activate(d,dw)?.id===d.jobId);
 completeJob(d.jobId,dw);
 db.prepare("UPDATE tasks SET status='completed',phase='completed',completed_at=?,updated_at=? WHERE id=?").run(now(),now(),d.taskId);
 db.prepare("UPDATE projects SET status='completed',phase='completed',updated_at=? WHERE id=?").run(now(),d.projectId);
 check("Worker completion succeeds before control",getJob(d.jobId)?.status==="completed");
 check("Late pause rejects completed task",throws(()=>pauseTask(d.taskId,"late pause")));
 check("Late cancel rejects completed task",throws(()=>cancelTaskJob(d.taskId,"late cancel")));
 check("Completed job remains completed",getJob(d.jobId)?.status==="completed");
 check("Completed task remains completed",row("tasks",d.taskId)?.status==="completed");

 console.log("\n--- CONTROL ENFORCEMENT ---");
 const e=createFixture(5);
 pauseTask(e.taskId,"control enforcement pause");
 let pauseControl=null;
 try{assertTaskRunnable(e.taskId)}catch(error){pauseControl=error}
 check("Runnable guard detects paused task",pauseControl instanceof TaskControlError&&pauseControl.action==="pause");

 const f=createFixture(6);
 cancelTaskJob(f.taskId,"control enforcement cancel");
 let cancelControl=null;
 try{assertTaskRunnable(f.taskId)}catch(error){cancelControl=error}
 check("Runnable guard detects cancelled task",cancelControl instanceof TaskControlError&&cancelControl.action==="cancel");

 console.log("\n--- RAPID CONTROL STRESS ---");
 const raceFixtures=[];
 for(let i=0;i<20;i++)raceFixtures.push(createFixture(100+i));

 for(let i=0;i<raceFixtures.length;i++){
  const f=raceFixtures[i];
  const worker=`b6p5-race-worker-${i}`;
  const claimed=activate(f,worker);
  check(`Race ${i+1} claimed`,claimed?.id===f.jobId);

  if(i%2===0){
   pauseTask(f.taskId,`Race pause ${i}`);
   try{completeJob(f.jobId,worker)}catch{}
   check(`Race ${i+1} pause wins over late completion`,getJob(f.jobId)?.status==="paused");
   check(`Race ${i+1} pause preserves attempts`,getJob(f.jobId)?.attempts===0);
  }else{
   cancelTaskJob(f.taskId,`Race cancel ${i}`);
   try{completeJob(f.jobId,worker)}catch{}
   check(`Race ${i+1} cancel wins over late completion`,getJob(f.jobId)?.status==="cancelled");
   check(`Race ${i+1} cancel preserves attempts`,getJob(f.jobId)?.attempts===0);
  }

  check(`Race ${i+1} clears ownership`,getJob(f.jobId)?.claimed_by==null);
 }

 console.log("\n--- FINAL INTEGRITY ---");
 const invalidControlled=Number(db.prepare(`
  SELECT COUNT(*) count FROM jobs
  WHERE id LIKE ?
  AND status IN ('paused','cancelled')
  AND (
   claimed_by IS NOT NULL OR
   claimed_at IS NOT NULL OR
   lease_expires_at IS NOT NULL OR
   heartbeat_at IS NOT NULL
  )
 `).get(`${tag}%`)?.count||0);

 check("No controlled stress job retains ownership metadata",invalidControlled===0,`invalid=${invalidControlled}`);

 const attemptLeak=Number(db.prepare(`
  SELECT COUNT(*) count FROM jobs
  WHERE id LIKE ? AND attempts<>0
 `).get(`${tag}%`)?.count||0);

 check("Control races consume zero execution attempts",attemptLeak===0,`attemptLeaks=${attemptLeak}`);

 cleanup();

 const remainingJobs=Number(db.prepare("SELECT COUNT(*) count FROM jobs WHERE id LIKE ?").get(`${tag}%`)?.count||0);
 const remainingTasks=Number(db.prepare("SELECT COUNT(*) count FROM tasks WHERE id LIKE ?").get(`${tag}%`)?.count||0);
 const remainingProjects=Number(db.prepare("SELECT COUNT(*) count FROM projects WHERE id LIKE ?").get(`${tag}%`)?.count||0);

 check("Stress jobs cleaned",remainingJobs===0,`remaining=${remainingJobs}`);
 check("Stress tasks cleaned",remainingTasks===0,`remaining=${remainingTasks}`);
 check("Stress projects cleaned",remainingProjects===0,`remaining=${remainingProjects}`);

}catch(error){
 console.error(`\nPASS 5 ERROR: ${error.stack||error.message}`);
 failed++;
 try{cleanup()}catch{}
}

console.log("\n============================================================");
console.log(" BATCH 6 PASS 5 RESULT");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed){
 console.log("\nCANCELLATION / CONTROL RACE STRESS FAILED.");
 process.exitCode=1;
}else{
 console.log("\nCANCELLATION / CONTROL RACE STRESS PASSED.");
 console.log("Pause vs worker completion:      PASS");
 console.log("Resume/reclaim:                  PASS");
 console.log("Cancel vs worker completion:     PASS");
 console.log("Repeated cancellation:           PASS");
 console.log("Cancel vs stale recovery:        PASS");
 console.log("Completion vs late controls:     PASS");
 console.log("Control enforcement:             PASS");
 console.log("20 rapid control races:          PASS");
 console.log("Attempt-budget preservation:     PASS");
 console.log("Ownership cleanup:               PASS");
 console.log("Database cleanup:                PASS");
}
