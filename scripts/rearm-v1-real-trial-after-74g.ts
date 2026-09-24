import {db} from "../src/database/database.js";
import {extendJobForAutonomousRecovery} from "../src/jobs/job.repository.js";

const projectId="prj_59e5737b2866ea25";
const taskId="tsk_067b81f72558ef83";
const recoveryId="rcv_4b781ea4a12d7e3c";

function fail(message:string):never{
 throw new Error(message);
}

const recovery=db.prepare(`
 SELECT * FROM team_recoveries WHERE id=?
`).get(recoveryId) as any;

const task=db.prepare(`
 SELECT * FROM tasks WHERE id=?
`).get(taskId) as any;

const job=db.prepare(`
 SELECT *
 FROM jobs
 WHERE task_id=?
 ORDER BY rowid DESC
 LIMIT 1
`).get(taskId) as any;

if(!recovery)fail("Recovery not found.");
if(!task)fail("Task not found.");
if(!job)fail("Job not found.");
if(recovery.project_id!==projectId)fail("Unexpected recovery project.");
if(recovery.task_id!==taskId)fail("Unexpected recovery task.");
if(Number(recovery.attempts)!==6)fail(`Expected 6 historical repair attempts, found ${recovery.attempts}.`);
if(Number(recovery.max_attempts)!==9)fail(`Expected durable repair budget 9, found ${recovery.max_attempts}.`);
if(Number(job.attempts)!==6)fail(`Expected outer job attempts 6, found ${job.attempts}.`);
if(Number(job.max_attempts)!==6)fail(`Expected outer job max attempts 6, found ${job.max_attempts}.`);

console.log("\nBEFORE:");
console.log(JSON.stringify({
 recovery:{
  id:recovery.id,
  status:recovery.status,
  attempts:recovery.attempts,
  maxAttempts:recovery.max_attempts
 },
 job:{
  id:job.id,
  status:job.status,
  attempts:job.attempts,
  maxAttempts:job.max_attempts
 },
 task:{
  id:task.id,
  status:task.status,
  phase:task.phase,
  repairAttempts:task.repair_attempts
 }
},null,2));

const extendedJob=extendJobForAutonomousRecovery(job.id,1);
if(!extendedJob)fail("Outer job extension rejected.");

const now=new Date().toISOString();

db.exec("BEGIN IMMEDIATE");
try{
 db.prepare(`
  UPDATE team_recoveries
  SET status='recovering',
      completed_at=NULL,
      error=NULL,
      updated_at=?
  WHERE id=?
 `).run(now,recoveryId);

 db.prepare(`
  UPDATE tasks
  SET status='queued',
      phase='recovering',
      error=NULL,
      updated_at=?
  WHERE id=?
 `).run(now,taskId);

 db.prepare(`
  UPDATE goal_work_items
  SET status='ready',
      updated_at=?
  WHERE id=?
 `).run(now,recovery.work_item_id);

 db.prepare(`
  UPDATE goal_work_dispatches
  SET status='queued',
      updated_at=?
  WHERE task_id=?
 `).run(now,taskId);

 db.prepare(`
  UPDATE agent_assignments
  SET status='assigned',
      updated_at=?
  WHERE id=?
 `).run(now,recovery.assignment_id);

 db.prepare(`
  UPDATE projects
  SET status='active',
      phase='autonomous_development',
      updated_at=?
  WHERE id=?
 `).run(now,projectId);

 db.exec("COMMIT");
}catch(error){
 try{db.exec("ROLLBACK")}catch{}
 throw error;
}

const afterRecovery=db.prepare(`
 SELECT * FROM team_recoveries WHERE id=?
`).get(recoveryId) as any;

const afterJob=db.prepare(`
 SELECT * FROM jobs WHERE id=?
`).get(job.id) as any;

const afterTask=db.prepare(`
 SELECT id,status,phase,repair_attempts,error
 FROM tasks WHERE id=?
`).get(taskId) as any;

const work=db.prepare(`
 SELECT id,status
 FROM goal_work_items
 WHERE id=?
`).get(recovery.work_item_id) as any;

const assignment=db.prepare(`
 SELECT id,status
 FROM agent_assignments
 WHERE id=?
`).get(recovery.assignment_id) as any;

const checks=[
 ["same recovery",afterRecovery.id===recoveryId],
 ["repair attempts preserved",Number(afterRecovery.attempts)===6],
 ["repair max remains nine",Number(afterRecovery.max_attempts)===9],
 ["recovery reopened",afterRecovery.status==="recovering"],
 ["outer attempts preserved",Number(afterJob.attempts)===6],
 ["outer max extended once",Number(afterJob.max_attempts)===7],
 ["job queued",afterJob.status==="queued"],
 ["task queued",afterTask.status==="queued"],
 ["task repair count preserved",Number(afterTask.repair_attempts)===6],
 ["work ready",work?.status==="ready"],
 ["assignment assigned",assignment?.status==="assigned"]
] as const;

let failures=0;

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
 task:afterTask,
 work,
 assignment
},null,2));

console.log("\nCHECKS:");
for(const [name,ok] of checks){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok)failures++;
}

console.log("\n============================================================");
console.log(`7.4G.2 RE-ARM: ${checks.length-failures}/${checks.length}`);
console.log("Same project:",projectId);
console.log("Repair history reset: NO");
console.log("Workspace manually modified: NO");
console.log("AI calls: NONE");
console.log("GitHub calls: NONE");
console.log("============================================================");

process.exitCode=failures?1:0;
