import {db} from "../src/database/database.js";
import {extendTeamRecoveryBudget} from "../src/team/team-recovery-budget.service.js";
import {extendJobForAutonomousRecovery} from "../src/jobs/job.repository.js";

const projectId="prj_59e5737b2866ea25";
const recoveryId="rcv_4b781ea4a12d7e3c";
const jobId="job_ef6fd5f994644d1e";
const taskId="tsk_067b81f72558ef83";
const workId="wrk_5de86314600ffcf5";
const assignmentId="asg_12332071d557b2ec";

const one=(sql:string,...args:any[])=>db.prepare(sql).get(...args) as any;

function snapshot(){
 const recovery=one("SELECT * FROM team_recoveries WHERE id=?",recoveryId);
 const job=one("SELECT * FROM jobs WHERE id=?",jobId);
 const task=one("SELECT * FROM tasks WHERE id=?",taskId);
 const work=one("SELECT * FROM goal_work_items WHERE id=?",workId);
 const assignment=one("SELECT * FROM agent_assignments WHERE id=?",assignmentId);
 return{
  recovery:{
   id:recovery?.id,
   projectId:recovery?.project_id,
   taskId:recovery?.task_id,
   workItemId:recovery?.work_item_id,
   assignmentId:recovery?.assignment_id,
   status:recovery?.status,
   attempts:Number(recovery?.attempts),
   maxAttempts:Number(recovery?.max_attempts)
  },
  job:{
   id:job?.id,
   taskId:job?.task_id,
   status:job?.status,
   attempts:Number(job?.attempts),
   maxAttempts:Number(job?.max_attempts)
  },
  task:{
   id:task?.id,
   status:task?.status,
   phase:task?.phase,
   repairAttempts:Number(task?.repair_attempts),
   error:task?.error
  },
  work:{
   id:work?.id,
   status:work?.status
  },
  assignment:{
   id:assignment?.id,
   status:assignment?.status
  }
 };
}

const before=snapshot();

console.log("\nBEFORE:");
console.log(JSON.stringify(before,null,2));

if(before.recovery.id!==recoveryId)throw new Error("Recovery missing.");
if(before.recovery.projectId!==projectId)throw new Error("Recovery belongs to unexpected project.");
if(before.recovery.taskId!==taskId)throw new Error("Recovery belongs to unexpected task.");
if(before.recovery.workItemId!==workId)throw new Error("Recovery belongs to unexpected work item.");
if(before.recovery.assignmentId!==assignmentId)throw new Error("Recovery belongs to unexpected assignment.");
if(before.recovery.status!=="exhausted")throw new Error(`Expected exhausted recovery, got ${before.recovery.status}`);
if(before.recovery.attempts!==before.recovery.maxAttempts)throw new Error(`Recovery is not at budget boundary: ${before.recovery.attempts}/${before.recovery.maxAttempts}`);
if(before.job.id!==jobId||before.job.taskId!==taskId)throw new Error("Unexpected outer job.");
if(before.job.status!=="failed")throw new Error(`Expected failed outer job, got ${before.job.status}`);
if(before.job.attempts!==before.job.maxAttempts)throw new Error(`Outer job is not at attempt boundary: ${before.job.attempts}/${before.job.maxAttempts}`);

const recoveryExtended=extendTeamRecoveryBudget(recoveryId,3);
if(!recoveryExtended)throw new Error("Recovery budget extension rejected.");

const jobExtended=extendJobForAutonomousRecovery(jobId,1);
if(!jobExtended)throw new Error("Outer job extension rejected.");

const stamp=new Date().toISOString();

db.exec("BEGIN IMMEDIATE");
try{
 db.prepare(`
  UPDATE tasks
  SET status='queued',
      phase='recovering',
      error=NULL,
      updated_at=?
  WHERE id=?
 `).run(stamp,taskId);

 db.prepare(`
  UPDATE goal_work_items
  SET status='ready',
      updated_at=?
  WHERE id=?
 `).run(stamp,workId);

 db.prepare(`
  UPDATE agent_assignments
  SET status='assigned',
      updated_at=?
  WHERE id=?
 `).run(stamp,assignmentId);

 db.prepare(`
  UPDATE projects
  SET status='active',
      phase='autonomous_development',
      updated_at=?
  WHERE id=?
 `).run(stamp,projectId);

 db.exec("COMMIT");
}catch(error){
 try{db.exec("ROLLBACK")}catch{}
 throw error;
}

const after=snapshot();

console.log("\nAFTER:");
console.log(JSON.stringify(after,null,2));

let pass=0;
let fail=0;

function check(name:string,value:boolean){
 if(value){
  pass++;
  console.log(`PASS ${name}`);
 }else{
  fail++;
  console.log(`FAIL ${name}`);
 }
}

console.log("\nCHECKS:");
check("same recovery",after.recovery.id===before.recovery.id);
check("same project",after.recovery.projectId===projectId);
check("same tester task",after.recovery.taskId===taskId);
check("same work item",after.recovery.workItemId===workId);
check("same assignment",after.recovery.assignmentId===assignmentId);
check("repair attempts preserved",after.recovery.attempts===before.recovery.attempts);
check("repair budget extended exactly three",after.recovery.maxAttempts===before.recovery.maxAttempts+3);
check("recovery reopened",after.recovery.status==="recovering");
check("outer attempts preserved",after.job.attempts===before.job.attempts);
check("outer max extended exactly once",after.job.maxAttempts===before.job.maxAttempts+1);
check("job queued",after.job.status==="queued");
check("task queued",after.task.status==="queued");
check("task recovering",after.task.phase==="recovering");
check("task repair count preserved",after.task.repairAttempts===before.task.repairAttempts);
check("task error cleared",after.task.error===null);
check("work ready",after.work.status==="ready");
check("assignment assigned",after.assignment.status==="assigned");

console.log(`\n7.4I.1 CORRECTED RE-ARM: ${pass}/${pass+fail}`);
console.log("Same trial project:",projectId);
console.log("Workspace manually modified: NO");
console.log("Repair history reset: NO");
console.log("AI calls: NONE");
console.log("GitHub calls: NONE");

if(fail)process.exitCode=1;
