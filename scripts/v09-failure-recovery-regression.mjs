import crypto from "node:crypto";
import {db} from "../dist/database/database.js";
import {
 claimNextJob,
 consumeJobAttempt,
 getJob,
 recoverExpiredJobs
} from "../dist/jobs/job.repository.js";

let passed=0;
let failed=0;

function check(name,condition,detail=""){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${name}${detail?` - ${detail}`:""}`);
 }
}

const suffix=crypto.randomUUID().replaceAll("-","").slice(0,10);
const projectId=`b3_prj_${suffix}`;
const taskId=`b3_tsk_${suffix}`;
const jobId=`b3_job_${suffix}`;
const time=new Date().toISOString();
const workspace=`batch3-${suffix}`;

function cleanup(){
 db.prepare("DELETE FROM jobs WHERE id=?").run(jobId);
 db.prepare("DELETE FROM tasks WHERE id=?").run(taskId);
 db.prepare("DELETE FROM projects WHERE id=?").run(projectId);
}

cleanup();

try{
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,"Batch 3 Regression",`batch3-${suffix}`,
  "queued","queued",0,workspace,time,time
 );

 db.prepare(`
  INSERT INTO tasks(
   id,project_id,title,prompt,status,phase,priority,
   attempts,repair_attempts,max_attempts,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  taskId,projectId,"Batch 3 Regression","Regression fixture",
  "queued","queued",100,0,0,3,time,time
 );

 db.prepare(`
  INSERT INTO jobs(
   id,type,task_id,project_id,status,priority,attempts,max_attempts,
   available_at,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  jobId,"task",taskId,projectId,"queued",100,0,3,time,time,time
 );

 const first=claimNextJob("batch3-worker-a");
 check("fresh job claimed",first?.id===jobId);
 check(
  "claim does not consume attempt",
  getJob(jobId)?.attempts===0,
  `attempts=${getJob(jobId)?.attempts}`
 );

 const consumed=consumeJobAttempt(jobId,"batch3-worker-a");
 check(
  "real execution failure consumes attempt",
  consumed?.attempts===1,
  `attempts=${consumed?.attempts}`
 );

 db.prepare(`
  UPDATE jobs
  SET status='queued',
      claimed_by=NULL,
      claimed_at=NULL,
      heartbeat_at=NULL,
      lease_expires_at=NULL,
      available_at=?,
      updated_at=?
  WHERE id=?
 `).run(time,time,jobId);

 const second=claimNextJob("batch3-worker-b");
 check("retry job claimed",second?.id===jobId);
 check(
  "retry claim preserves logical attempt",
  getJob(jobId)?.attempts===1,
  `attempts=${getJob(jobId)?.attempts}`
 );

 db.prepare(`
  UPDATE jobs
  SET lease_expires_at=?,
      heartbeat_at=?,
      updated_at=?
  WHERE id=?
 `).run(
  new Date(Date.now()-60000).toISOString(),
  new Date(Date.now()-60000).toISOString(),
  time,
  jobId
 );

 db.prepare(`
  UPDATE tasks
  SET status='running',phase='validation',attempts=1,updated_at=?
  WHERE id=?
 `).run(time,taskId);

 db.prepare(`
  UPDATE projects
  SET status='active',phase='validation',updated_at=?
  WHERE id=?
 `).run(time,projectId);

 const beforeRecovery=getJob(jobId)?.attempts;
 const recovered=recoverExpiredJobs();
 const afterRecovery=getJob(jobId);

 check(
  "expired worker lease recovered",
  Array.isArray(recovered)&&recovered.some(item=>item.id===jobId),
  `recovered=${Array.isArray(recovered)?recovered.length:"unexpected return type"}`
 );

 check(
  "infrastructure recovery preserves attempt count",
  afterRecovery?.attempts===beforeRecovery,
  `before=${beforeRecovery} after=${afterRecovery?.attempts}`
 );

 check(
  "recovered job becomes queued",
  afterRecovery?.status==="queued",
  `status=${afterRecovery?.status}`
 );

 check(
  "recovered ownership cleared",
  afterRecovery?.claimed_by===null
 );

 const recoveredTask=db.prepare(
  "SELECT status,phase,attempts FROM tasks WHERE id=?"
 ).get(taskId);

 check(
  "recovered task becomes resumable",
  recoveredTask?.status==="queued"&&recoveredTask?.phase==="resuming"
 );

 check(
  "task logical attempt preserved",
  recoveredTask?.attempts===1,
  `attempts=${recoveredTask?.attempts}`
 );

 const third=claimNextJob("batch3-worker-c");

 check(
  "replacement worker can reclaim recovered job",
  third?.id===jobId
 );

 check(
  "replacement claim still preserves attempt count",
  getJob(jobId)?.attempts===1,
  `attempts=${getJob(jobId)?.attempts}`
 );

 const duplicate=claimNextJob("batch3-worker-d");

 check(
  "recovered job cannot be double claimed",
  !duplicate||duplicate.id!==jobId
 );

 console.log("\n============================================================");
 console.log(" VEYLITH v0.9 BATCH 3 FAILURE SEMANTICS");
 console.log("============================================================");
 console.log(`Passed: ${passed}`);
 console.log(`Failed: ${failed}`);
 console.log(`Total:  ${passed+failed}`);

 if(failed){
  console.log("\nVEYLITH v0.9 BATCH 3 PASS 1 FAILED");
  process.exitCode=1;
 }else{
  console.log("\nVEYLITH v0.9 BATCH 3 PASS 1 PASSED");
 }
}finally{
 cleanup();
}

