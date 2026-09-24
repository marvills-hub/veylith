import {db} from "../src/database/database.js";

const IDS={
 project:"prj_59e5737b2866ea25",
 goal:"gol_c258fc809510a809",
 recovery:"rcv_4b781ea4a12d7e3c",
 job:"job_ef6fd5f994644d1e",
 task:"tsk_067b81f72558ef83",
 work:"wrk_5de86314600ffcf5",
 assignment:"asg_12332071d557b2ec",
 roleResult:"rrs_612407fb05797ac4",
 lifecycle:"alc_55c5545406de9da3"
};

function one(sql:string,...args:any[]){
 return db.prepare(sql).get(...args) as any;
}

function fail(message:string):never{
 throw new Error(message);
}

const before={
 project:one("SELECT * FROM projects WHERE id=?",IDS.project),
 goal:one("SELECT * FROM project_goals WHERE id=?",IDS.goal),
 recovery:one("SELECT * FROM team_recoveries WHERE id=?",IDS.recovery),
 job:one("SELECT * FROM jobs WHERE id=?",IDS.job),
 task:one("SELECT * FROM tasks WHERE id=?",IDS.task),
 work:one("SELECT * FROM goal_work_items WHERE id=?",IDS.work),
 assignment:one("SELECT * FROM agent_assignments WHERE id=?",IDS.assignment),
 roleResult:one("SELECT * FROM goal_role_results WHERE id=?",IDS.roleResult),
 lifecycle:one("SELECT * FROM autonomous_lifecycle_checkpoints WHERE id=?",IDS.lifecycle)
};

console.log("\n--- BEFORE ---");
console.log(JSON.stringify(before,null,2));

if(!before.project) fail("Trial project missing.");
if(!before.goal) fail("Trial goal missing.");
if(!before.recovery) fail("Recovery missing.");
if(!before.job) fail("Outer job missing.");
if(!before.task) fail("Tester task missing.");
if(!before.work) fail("Tester work item missing.");
if(!before.assignment) fail("Tester assignment missing.");
if(!before.roleResult) fail("Tester role result missing.");
if(!before.lifecycle) fail("Lifecycle checkpoint missing.");

if(before.project.id!==IDS.project) fail("Project identity mismatch.");
if(before.goal.project_id!==IDS.project) fail("Goal project mismatch.");

if(
 before.recovery.project_id!==IDS.project||
 before.recovery.goal_id!==IDS.goal||
 before.recovery.work_item_id!==IDS.work||
 before.recovery.assignment_id!==IDS.assignment||
 before.recovery.task_id!==IDS.task
) fail("Recovery authority mismatch.");

if(before.recovery.status!=="exhausted") fail(`Recovery must be exhausted, got ${before.recovery.status}.`);
if(Number(before.recovery.attempts)!==12) fail(`Expected recovery attempts=12, got ${before.recovery.attempts}.`);
if(Number(before.recovery.max_attempts)!==12) fail(`Expected recovery max=12, got ${before.recovery.max_attempts}.`);

if(before.job.status!=="failed") fail(`Outer job must be failed, got ${before.job.status}.`);
if(Number(before.job.attempts)!==8) fail(`Expected outer attempts=8, got ${before.job.attempts}.`);
if(Number(before.job.max_attempts)!==8) fail(`Expected outer max=8, got ${before.job.max_attempts}.`);

if(before.work.status!=="failed") fail(`Tester work must be failed, got ${before.work.status}.`);
if(before.assignment.status!=="failed") fail(`Assignment must be failed, got ${before.assignment.status}.`);
if(before.roleResult.status!=="failed") fail(`Role result must be failed, got ${before.roleResult.status}.`);
if(before.lifecycle.status!=="failed") fail(`Lifecycle must be failed, got ${before.lifecycle.status}.`);

const now=new Date().toISOString();

db.exec("BEGIN IMMEDIATE");
try{
 db.prepare(`
  UPDATE team_recoveries
  SET status='recovering',
      max_attempts=max_attempts+3,
      error=NULL,
      completed_at=NULL,
      updated_at=?
  WHERE id=?
    AND status='exhausted'
    AND attempts=12
    AND max_attempts=12
 `).run(now,IDS.recovery);

 db.prepare(`
  UPDATE jobs
  SET status='queued',
      max_attempts=max_attempts+1,
      last_error=NULL,
      locked_by=NULL,
      locked_at=NULL,
      lease_expires_at=NULL,
      available_at=?,
      updated_at=?
  WHERE id=?
    AND status='failed'
    AND attempts=8
    AND max_attempts=8
 `).run(now,now,IDS.job);

 db.prepare(`
  UPDATE tasks
  SET status='queued',
      phase='recovering',
      error=NULL,
      updated_at=?
  WHERE id=?
 `).run(now,IDS.task);

 db.prepare(`
  UPDATE goal_work_items
  SET status='ready',
      completed_at=NULL,
      updated_at=?
  WHERE id=?
    AND status='failed'
 `).run(now,IDS.work);

 db.prepare(`
  UPDATE agent_assignments
  SET status='assigned',
      error=NULL,
      completed_at=NULL,
      updated_at=?
  WHERE id=?
    AND status='failed'
 `).run(now,IDS.assignment);

 db.prepare(`
  UPDATE goal_role_results
  SET status='running',
      error=NULL,
      completed_at=NULL,
      updated_at=?
  WHERE id=?
    AND status='failed'
 `).run(now,IDS.roleResult);

 db.prepare(`
  UPDATE autonomous_lifecycle_checkpoints
  SET stage='development',
      status='running',
      error=NULL,
      completed_at=NULL,
      updated_at=?
  WHERE id=?
    AND status='failed'
 `).run(now,IDS.lifecycle);

 db.prepare(`
  UPDATE goal_work_dispatches
  SET status='queued',
      updated_at=?
  WHERE work_item_id=?
    AND job_id=?
 `).run(now,IDS.work,IDS.job);

 db.exec("COMMIT");
}catch(error){
 try{db.exec("ROLLBACK");}catch{}
 throw error;
}

const after={
 project:one("SELECT * FROM projects WHERE id=?",IDS.project),
 goal:one("SELECT * FROM project_goals WHERE id=?",IDS.goal),
 recovery:one("SELECT * FROM team_recoveries WHERE id=?",IDS.recovery),
 job:one("SELECT * FROM jobs WHERE id=?",IDS.job),
 task:one("SELECT * FROM tasks WHERE id=?",IDS.task),
 work:one("SELECT * FROM goal_work_items WHERE id=?",IDS.work),
 assignment:one("SELECT * FROM agent_assignments WHERE id=?",IDS.assignment),
 roleResult:one("SELECT * FROM goal_role_results WHERE id=?",IDS.roleResult),
 lifecycle:one("SELECT * FROM autonomous_lifecycle_checkpoints WHERE id=?",IDS.lifecycle),
 dispatch:one("SELECT * FROM goal_work_dispatches WHERE work_item_id=?",IDS.work)
};

console.log("\n--- AFTER ---");
console.log(JSON.stringify(after,null,2));

const checks=[
 ["same project",after.project?.id===before.project?.id],
 ["same goal",after.goal?.id===before.goal?.id],
 ["same recovery",after.recovery?.id===before.recovery?.id],
 ["recovery attempts preserved",Number(after.recovery?.attempts)===12],
 ["recovery max extended to 15",Number(after.recovery?.max_attempts)===15],
 ["recovery recovering",after.recovery?.status==="recovering"],
 ["same outer job",after.job?.id===before.job?.id],
 ["outer attempts preserved",Number(after.job?.attempts)===8],
 ["outer max extended to 9",Number(after.job?.max_attempts)===9],
 ["outer job queued",after.job?.status==="queued"],
 ["tester task queued",after.task?.status==="queued"],
 ["tester work ready",after.work?.status==="ready"],
 ["same assignment",after.assignment?.id===before.assignment?.id],
 ["assignment assigned",after.assignment?.status==="assigned"],
 ["same role result",after.roleResult?.id===before.roleResult?.id],
 ["role result running",after.roleResult?.status==="running"],
 ["lifecycle running",after.lifecycle?.status==="running"],
 ["dispatch queued",after.dispatch?.status==="queued"]
] as const;

console.log("\n--- CHECKS ---");
let failed=0;
for(const [name,ok] of checks){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok) failed++;
}

if(failed) fail(`${failed} continuation checks failed.`);

console.log("\n============================================================");
console.log(`7.4K.2 CONTROLLED RE-ARM: ${checks.length}/${checks.length}`);
console.log("New project created:       NO");
console.log("Workspace manually edited: NO");
console.log("Recovery attempts reset:   NO");
console.log("Recovery budget:           12/12 -> 12/15");
console.log("Outer job budget:          8/8 -> 8/9");
console.log("AI calls:                  NONE");
console.log("GitHub calls:              NONE");
console.log("Runtime:                   STOPPED");
console.log("============================================================");
