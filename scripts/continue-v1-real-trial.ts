import {db} from "../src/database/database.js";
import {extendTeamRecoveryBudget} from "../src/team/team-recovery-budget.service.js";
import {extendJobForAutonomousRecovery} from "../src/jobs/job.repository.js";

const projectId="prj_59e5737b2866ea25";
const taskId="tsk_067b81f72558ef83";
const recoveryId="rcv_4b781ea4a12d7e3c";

function fail(message:string):never{
 throw new Error(message);
}

const beforeRecovery=db.prepare(
 "SELECT * FROM team_recoveries WHERE id=?"
).get(recoveryId) as any;

if(!beforeRecovery)fail("Trial recovery not found.");
if(beforeRecovery.project_id!==projectId)fail("Recovery belongs to unexpected project.");
if(beforeRecovery.task_id!==taskId)fail("Recovery belongs to unexpected task.");
if(Number(beforeRecovery.attempts)!==6)fail(`Expected 6 historical repair attempts, found ${beforeRecovery.attempts}.`);
if(Number(beforeRecovery.max_attempts)!==6)fail(`Expected original 6-attempt budget, found ${beforeRecovery.max_attempts}.`);

const jobs=db.prepare(`
 SELECT *
 FROM jobs
 WHERE task_id=?
 ORDER BY updated_at DESC,rowid DESC
`).all(taskId) as any[];

const failedJob=jobs.find(job=>
 job.status==="failed"&&
 Number(job.attempts)>=Number(job.max_attempts)
);

if(!failedJob)fail("No exhausted tester job found.");

console.log("\nBEFORE:");
console.log(JSON.stringify({
 recovery:{
  id:beforeRecovery.id,
  status:beforeRecovery.status,
  attempts:beforeRecovery.attempts,
  maxAttempts:beforeRecovery.max_attempts
 },
 job:{
  id:failedJob.id,
  status:failedJob.status,
  attempts:failedJob.attempts,
  maxAttempts:failedJob.max_attempts
 }
},null,2));

const recovery=extendTeamRecoveryBudget(recoveryId,3);
if(!recovery)fail("Recovery budget extension was rejected.");

const job=extendJobForAutonomousRecovery(failedJob.id,1);
if(!job)fail("Job recovery extension was rejected.");

const time=new Date().toISOString();

db.exec("BEGIN IMMEDIATE");
try{
 db.prepare(`
  UPDATE tasks
  SET status='queued',
      phase='recovering',
      error=NULL,
      updated_at=?
  WHERE id=?
 `).run(time,taskId);

 db.prepare(`
  UPDATE goal_work_items
  SET status='ready',
      updated_at=?
  WHERE id=?
 `).run(time,beforeRecovery.work_item_id);

 db.prepare(`
  UPDATE goal_work_dispatches
  SET status='queued',
      updated_at=?
  WHERE task_id=?
 `).run(time,taskId);

 db.prepare(`
  UPDATE agent_assignments
  SET status='assigned',
      updated_at=?
  WHERE id=?
 `).run(time,beforeRecovery.assignment_id);

 db.prepare(`
  UPDATE projects
  SET status='active',
      phase='autonomous_development',
      updated_at=?
  WHERE id=?
 `).run(time,projectId);

 db.exec("COMMIT");
}catch(error){
 try{db.exec("ROLLBACK")}catch{}
 throw error;
}

const afterRecovery=db.prepare(
 "SELECT * FROM team_recoveries WHERE id=?"
).get(recoveryId) as any;

const afterJob=db.prepare(
 "SELECT * FROM jobs WHERE id=?"
).get(failedJob.id) as any;

const task=db.prepare(
 "SELECT id,status,phase,repair_attempts,error FROM tasks WHERE id=?"
).get(taskId) as any;

const work=db.prepare(
 "SELECT id,status FROM goal_work_items WHERE id=?"
).get(beforeRecovery.work_item_id) as any;

const assignment=db.prepare(
 "SELECT id,status FROM agent_assignments WHERE id=?"
).get(beforeRecovery.assignment_id) as any;

console.log("\nAFTER:");
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
 task,
 work,
 assignment
},null,2));

const checks=[
 ["same recovery id",afterRecovery.id===recoveryId],
 ["repair history preserved",Number(afterRecovery.attempts)===6],
 ["repair budget extended to 9",Number(afterRecovery.max_attempts)===9],
 ["recovery is recoverable",afterRecovery.status==="recovering"],
 ["job attempts preserved",Number(afterJob.attempts)===Number(failedJob.attempts)],
 ["job budget extended by one",Number(afterJob.max_attempts)===Number(failedJob.max_attempts)+1],
 ["job queued",afterJob.status==="queued"],
 ["task queued",task?.status==="queued"],
 ["task repair history preserved",Number(task?.repair_attempts)===6],
 ["work ready",work?.status==="ready"],
 ["assignment assigned",assignment?.status==="assigned"]
] as const;

let failures=0;

console.log("\nCHECKS:");
for(const [name,ok] of checks){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok)failures++;
}

console.log("\n============================================================");
console.log(`7.4F.3 CONTINUATION: ${checks.length-failures}/${checks.length}`);
console.log("Project:",projectId);
console.log("New project created: NO");
console.log("Workspace manually modified: NO");
console.log("Repair attempts reset: NO");
console.log("AI calls: NONE");
console.log("GitHub calls: NONE");
console.log("============================================================");

process.exitCode=failures?1:0;
