import crypto from "node:crypto";
import {db} from "../dist/database/database.js";
import {
 claimNextJob,
 consumeJobAttempt,
 getJob,
 recoverExpiredJobs
} from "../dist/jobs/job.repository.js";
import {classifyJobFailure} from "../dist/jobs/job-failure-classifier.service.js";
import {AIProviderError} from "../dist/core/ai-error.service.js";
import {TaskControlError} from "../dist/core/task-control.service.js";

let passed=0;
let failed=0;
const ids=[];

function check(name,condition,detail=""){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${name}${detail?` - ${detail}`:""}`);
 }
}

function makeFixture(name,maxAttempts=3,attempts=0){
 const suffix=crypto.randomUUID().replaceAll("-","").slice(0,10);
 const projectId=`b3p3_prj_${suffix}`;
 const taskId=`b3p3_tsk_${suffix}`;
 const jobId=`b3p3_job_${suffix}`;
 const time=new Date().toISOString();

 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,`Batch 3 Pass 3 ${name}`,`b3p3-${suffix}`,
  "queued","queued",0,`b3p3-${suffix}`,time,time
 );

 db.prepare(`
  INSERT INTO tasks(
   id,project_id,title,prompt,status,phase,priority,
   attempts,repair_attempts,max_attempts,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  taskId,projectId,name,"Batch 3 Pass 3 fixture",
  "queued","queued",100,attempts,0,maxAttempts,time,time
 );

 db.prepare(`
  INSERT INTO jobs(
   id,type,task_id,project_id,status,priority,attempts,max_attempts,
   available_at,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  jobId,"task",taskId,projectId,"queued",100,
  attempts,maxAttempts,time,time,time
 );

 ids.push({projectId,taskId,jobId});
 return {projectId,taskId,jobId,time};
}

function expire(fixture){
 const old=new Date(Date.now()-60000).toISOString();
 db.prepare(`
  UPDATE jobs
  SET lease_expires_at=?,heartbeat_at=?,updated_at=?
  WHERE id=?
 `).run(old,old,fixture.time,fixture.jobId);
 db.prepare(`
  UPDATE tasks
  SET status='running',phase='validation',updated_at=?
  WHERE id=?
 `).run(fixture.time,fixture.taskId);
 db.prepare(`
  UPDATE projects
  SET status='active',phase='validation',updated_at=?
  WHERE id=?
 `).run(fixture.time,fixture.projectId);
}

function task(id){
 return db.prepare("SELECT * FROM tasks WHERE id=?").get(id);
}

function project(id){
 return db.prepare("SELECT * FROM projects WHERE id=?").get(id);
}

function cleanup(){
 for(const item of ids.reverse()){
  db.prepare("DELETE FROM jobs WHERE id=?").run(item.jobId);
  db.prepare("DELETE FROM tasks WHERE id=?").run(item.taskId);
  db.prepare("DELETE FROM projects WHERE id=?").run(item.projectId);
 }
}

try{
 console.log("\n=== CONTROL FAILURE MATRIX ===");

 const pause=classifyJobFailure(
  new TaskControlError("pause","pause")
 );
 check(
  "pause consumes no execution attempt",
  pause.kind==="control_pause"&&!pause.consumeAttempt&&!pause.terminal
 );

 const cancel=classifyJobFailure(
  new TaskControlError("cancel","cancel")
 );
 check(
  "cancel consumes no execution attempt",
  cancel.kind==="control_cancel"&&!cancel.consumeAttempt&&cancel.terminal
 );

 console.log("\n=== PROVIDER FAILURE MATRIX ===");

 const retryableProvider=classifyJobFailure(
  new AIProviderError("temporary outage",{
   provider:"pass3",
   status:503,
   retryable:true
  })
 );
 check(
  "retryable provider failure preserves execution budget",
  retryableProvider.kind==="provider_retryable"&&
  !retryableProvider.consumeAttempt&&
  retryableProvider.pause
 );

 const permanentProvider=classifyJobFailure(
  new AIProviderError("invalid key",{
   provider:"pass3",
   status:401,
   code:"invalid_api_key",
   retryable:false
  })
 );
 check(
  "permanent provider failure preserves execution budget",
  permanentProvider.kind==="provider_permanent"&&
  !permanentProvider.consumeAttempt&&
  permanentProvider.terminal
 );

 console.log("\n=== ACTUAL EXECUTION FAILURE MATRIX ===");

 const execution=classifyJobFailure(
  new Error("validation failed")
 );
 check(
  "actual execution failure consumes budget",
  execution.kind==="execution_retryable"&&execution.consumeAttempt
 );

 const executionFixture=makeFixture("execution");
 const executionClaim=claimNextJob("pass3-execution-worker");

 check(
  "execution fixture claimed",
  executionClaim?.id===executionFixture.jobId
 );

 const executionConsumed=consumeJobAttempt(
  executionFixture.jobId,
  "pass3-execution-worker"
 );

 check(
  "one actual failure increments exactly once",
  executionConsumed?.attempts===1,
  `attempts=${executionConsumed?.attempts}`
 );

 const wrongOwnerConsume=consumeJobAttempt(
  executionFixture.jobId,
  "pass3-other-worker"
 );

 check(
  "wrong worker cannot consume failure attempt",
  wrongOwnerConsume===null&&getJob(executionFixture.jobId)?.attempts===1
 );

 console.log("\n=== WORKER LOSS BEFORE FAILURE ===");

 const preFailure=makeFixture("pre-failure-loss");
 const preClaim=claimNextJob("pass3-lost-worker");

 check(
  "pre-failure worker owns job",
  preClaim?.id===preFailure.jobId
 );

 expire(preFailure);

 const preAttempts=getJob(preFailure.jobId)?.attempts;
 const recoveredPre=recoverExpiredJobs();
 const preRecovered=getJob(preFailure.jobId);

 check(
  "expired pre-failure worker detected",
  recoveredPre.some(item=>item.id===preFailure.jobId)
 );

 check(
  "worker loss before failure consumes no attempt",
  preRecovered?.attempts===preAttempts&&preAttempts===0,
  `before=${preAttempts} after=${preRecovered?.attempts}`
 );

 check(
  "pre-failure worker loss is resumable",
  preRecovered?.status==="queued"&&
  task(preFailure.taskId)?.status==="queued"&&
  task(preFailure.taskId)?.phase==="resuming"
 );

 const replacement=claimNextJob("pass3-replacement-worker");

 check(
  "replacement worker reclaims recovered job",
  replacement?.id===preFailure.jobId
 );

 const duplicate=claimNextJob("pass3-duplicate-worker");

 check(
  "recovered job has single owner",
  !duplicate||duplicate.id!==preFailure.jobId
 );

 console.log("\n=== FINAL FAILURE + WORKER LOSS ===");

 const exhausted=makeFixture("exhausted-loss",2,1);
 const exhaustedClaim=claimNextJob("pass3-final-worker");

 check(
  "final-attempt fixture claimed",
  exhaustedClaim?.id===exhausted.jobId
 );

 const finalConsumed=consumeJobAttempt(
  exhausted.jobId,
  "pass3-final-worker"
 );

 check(
  "final actual failure reaches max exactly",
  finalConsumed?.attempts===2&&finalConsumed?.max_attempts===2,
  `attempts=${finalConsumed?.attempts}`
 );

 expire(exhausted);

 const recoveredFinal=recoverExpiredJobs();
 const finalJob=getJob(exhausted.jobId);
 const finalTask=task(exhausted.taskId);
 const finalProject=project(exhausted.projectId);

 check(
  "expired exhausted worker detected",
  recoveredFinal.some(item=>item.id===exhausted.jobId)
 );

 check(
  "recorded final failure becomes terminal after worker loss",
  finalJob?.status==="failed",
  `status=${finalJob?.status}`
 );

 check(
  "exhausted recovery clears ownership",
  finalJob?.claimed_by===null&&
  finalJob?.lease_expires_at===null&&
  finalJob?.heartbeat_at===null
 );

 check(
  "exhausted task becomes terminal",
  finalTask?.status==="failed"&&finalTask?.phase==="failed"
 );

 check(
  "exhausted project becomes terminal",
  finalProject?.status==="failed"&&finalProject?.phase==="failed"
 );

 const impossibleClaim=claimNextJob("pass3-impossible-worker");

 check(
  "exhausted job cannot become stranded claimable work",
  !impossibleClaim||impossibleClaim.id!==exhausted.jobId
 );

 check(
  "exhausted job is not stranded queued",
  getJob(exhausted.jobId)?.status!=="queued"
 );

 console.log("\n============================================================");
 console.log(" VEYLITH v0.9 BATCH 3 PASS 3 RECOVERY MATRIX");
 console.log("============================================================");
 console.log(`Passed: ${passed}`);
 console.log(`Failed: ${failed}`);
 console.log(`Total:  ${passed+failed}`);

 if(failed){
  console.log("\nVEYLITH v0.9 BATCH 3 PASS 3 FAILED");
  process.exitCode=1;
 }else{
  console.log("\nVEYLITH v0.9 BATCH 3 PASS 3 MATRIX PASSED");
 }
}finally{
 cleanup();
}
