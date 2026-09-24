import {db} from "../src/database/database.js";
import {extendTeamRecoveryBudget} from "../src/team/team-recovery-budget.service.js";
import {extendJobForAutonomousRecovery} from "../src/jobs/job.repository.js";

const PROJECT_ID="prj_59e5737b2866ea25";
const GOAL_ID="gol_c258fc809510a809";
const RECOVERY_ID="rcv_4b781ea4a12d7e3c";
const JOB_ID="job_ef6fd5f994644d1e";
const TASK_ID="tsk_067b81f72558ef83";
const WORK_ID="wrk_5de86314600ffcf5";
const ASSIGNMENT_ID="asg_12332071d557b2ec";

let passed=0;
let failed=0;

function check(name:string,value:boolean){
 if(value){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.error(`FAIL ${name}`);
 }
}

function row(sql:string,id:string){
 return db.prepare(sql).get(id) as any;
}

const project=row(
 "SELECT * FROM projects WHERE id=?",
 PROJECT_ID
);

const goal=row(
 "SELECT * FROM goals WHERE id=?",
 GOAL_ID
);

const recovery=row(
 "SELECT * FROM team_recoveries WHERE id=?",
 RECOVERY_ID
);

const job=row(
 "SELECT * FROM jobs WHERE id=?",
 JOB_ID
);

const task=row(
 "SELECT * FROM tasks WHERE id=?",
 TASK_ID
);

const work=row(
 "SELECT * FROM goal_work_items WHERE id=?",
 WORK_ID
);

const assignment=row(
 "SELECT * FROM agent_assignments WHERE id=?",
 ASSIGNMENT_ID
);

console.log("\n--- BEFORE ---");
console.log(JSON.stringify({
 project:project&&{
  id:project.id,
  workspace:project.workspace,
  status:project.status,
  phase:project.phase
 },
 goal:goal&&{
  id:goal.id,
  projectId:goal.project_id,
  status:goal.status
 },
 recovery:recovery&&{
  id:recovery.id,
  taskId:recovery.task_id,
  workItemId:recovery.work_item_id,
  assignmentId:recovery.assignment_id,
  status:recovery.status,
  attempts:recovery.attempts,
  maxAttempts:recovery.max_attempts
 },
 job:job&&{
  id:job.id,
  taskId:job.task_id,
  status:job.status,
  attempts:job.attempts,
  maxAttempts:job.max_attempts
 },
 task:task&&{
  id:task.id,
  projectId:task.project_id,
  status:task.status,
  phase:task.phase,
  repairAttempts:task.repair_attempts
 },
 work:work&&{
  id:work.id,
  goalId:work.goal_id,
  status:work.status
 },
 assignment:assignment&&{
  id:assignment.id,
  workItemId:assignment.work_item_id,
  taskId:assignment.task_id,
  status:assignment.status
 }
},null,2));

console.log("\n--- PRECONDITIONS ---");

check("project identity",project?.id===PROJECT_ID);
check("goal identity",goal?.id===GOAL_ID);
check("goal belongs to project",goal?.project_id===PROJECT_ID);

check(
 "recovery identity preserved",
 recovery?.id===RECOVERY_ID
);

check(
 "recovery task identity preserved",
 recovery?.task_id===TASK_ID
);

check(
 "recovery work identity preserved",
 recovery?.work_item_id===WORK_ID
);

check(
 "recovery assignment identity preserved",
 recovery?.assignment_id===ASSIGNMENT_ID
);

check(
 "recovery attempts preserved at 12",
 Number(recovery?.attempts)===12
);

check(
 "recovery exhausted at 12/12",
 recovery?.status==="exhausted"
 &&Number(recovery?.max_attempts)===12
);

check(
 "outer job identity preserved",
 job?.id===JOB_ID
);

check(
 "outer job task identity preserved",
 job?.task_id===TASK_ID
);

check(
 "outer job exhausted at 8/8",
 job?.status==="failed"
 &&Number(job?.attempts)===8
 &&Number(job?.max_attempts)===8
);

check(
 "tester task failed",
 task?.status==="failed"
);

check(
 "tester work failed",
 work?.status==="failed"
);

check(
 "tester assignment failed",
 assignment?.status==="failed"
);

if(failed){
 console.error(
  `\nPRECONDITION FAILURE ${failed}. Nothing will be modified.`
 );
 process.exitCode=1;
}else{
 console.log("\n--- EXTEND DURABLE BUDGETS ---");

 const extendedRecovery=
  extendTeamRecoveryBudget(
   RECOVERY_ID,
   3
  );

 check(
  "same recovery row returned",
  extendedRecovery.id===RECOVERY_ID
 );

 check(
  "recovery attempts remain 12",
  Number(extendedRecovery.attempts)===12
 );

 check(
  "recovery max becomes 15",
  Number(extendedRecovery.maxAttempts)===15
 );

 check(
  "recovery returns to recovering",
  extendedRecovery.status==="recovering"
 );

 const extendedJob=
  extendJobForAutonomousRecovery(
   JOB_ID,
   1
  );

 check(
  "outer job extended",
  extendedJob===true
 );

 const now=new Date().toISOString();

 db.exec("BEGIN IMMEDIATE");

 try{
  db.prepare(`
   UPDATE tasks
   SET status='queued',
       phase='recovering',
       error=NULL,
       updated_at=?
   WHERE id=?
  `).run(
   now,
   TASK_ID
  );

  db.prepare(`
   UPDATE goal_work_items
   SET status='ready',
       error=NULL,
       updated_at=?
   WHERE id=?
  `).run(
   now,
   WORK_ID
  );

  db.prepare(`
   UPDATE agent_assignments
   SET status='assigned',
       error=NULL,
       updated_at=?
   WHERE id=?
  `).run(
   now,
   ASSIGNMENT_ID
  );

  db.prepare(`
   UPDATE projects
   SET status='running',
       phase='development',
       updated_at=?
   WHERE id=?
  `).run(
   now,
   PROJECT_ID
  );

  db.exec("COMMIT");
 }catch(error){
  db.exec("ROLLBACK");
  throw error;
 }

 console.log("\n--- AFTER ---");

 const afterRecovery=row(
  "SELECT * FROM team_recoveries WHERE id=?",
  RECOVERY_ID
 );

 const afterJob=row(
  "SELECT * FROM jobs WHERE id=?",
  JOB_ID
 );

 const afterTask=row(
  "SELECT * FROM tasks WHERE id=?",
  TASK_ID
 );

 const afterWork=row(
  "SELECT * FROM goal_work_items WHERE id=?",
  WORK_ID
 );

 const afterAssignment=row(
  "SELECT * FROM agent_assignments WHERE id=?",
  ASSIGNMENT_ID
 );

 console.log(JSON.stringify({
  recovery:{
   id:afterRecovery.id,
   status:afterRecovery.status,
   attempts:afterRecovery.attempts,
   maxAttempts:afterRecovery.max_attempts
  },
  job:{
   id:afterJob.id,
   status:afterJob.status,
   attempts:afterJob.attempts,
   maxAttempts:afterJob.max_attempts
  },
  task:{
   id:afterTask.id,
   status:afterTask.status,
   phase:afterTask.phase,
   repairAttempts:afterTask.repair_attempts,
   error:afterTask.error
  },
  work:{
   id:afterWork.id,
   status:afterWork.status,
   error:afterWork.error
  },
  assignment:{
   id:afterAssignment.id,
   status:afterAssignment.status,
   error:afterAssignment.error
  }
 },null,2));

 check(
  "same recovery retained",
  afterRecovery.id===RECOVERY_ID
 );

 check(
  "history count remains 12",
  Number(afterRecovery.attempts)===12
 );

 check(
  "recovery authority is 12/15",
  afterRecovery.status==="recovering"
  &&Number(afterRecovery.max_attempts)===15
 );

 check(
  "outer job becomes queued 8/9",
  afterJob.status==="queued"
  &&Number(afterJob.attempts)===8
  &&Number(afterJob.max_attempts)===9
 );

 check(
  "tester task requeued",
  afterTask.status==="queued"
  &&afterTask.phase==="recovering"
 );

 check(
  "repair attempts preserved",
  Number(afterTask.repair_attempts)===12
 );

 check(
  "tester work ready",
  afterWork.status==="ready"
 );

 check(
  "tester assignment assigned",
  afterAssignment.status==="assigned"
 );

 console.log(
  `\n7.4K.1 CONTROLLED CONTINUATION: ${passed}/${passed+failed}`
 );

 if(failed){
  process.exitCode=1;
 }
}
