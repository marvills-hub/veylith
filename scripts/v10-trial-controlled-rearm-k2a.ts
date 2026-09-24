import {db} from "../src/database/database.js";

const I={
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
function pass(name:string,ok:boolean){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok) fail(name);
}

console.log("\n--- PREFLIGHT / ROLLBACK VERIFICATION ---");

const project=one("SELECT * FROM projects WHERE id=?",I.project);
const goal=one("SELECT * FROM project_goals WHERE id=?",I.goal);
const recovery=one("SELECT * FROM team_recoveries WHERE id=?",I.recovery);
const job=one("SELECT * FROM jobs WHERE id=?",I.job);
const task=one("SELECT * FROM tasks WHERE id=?",I.task);
const work=one("SELECT * FROM goal_work_items WHERE id=?",I.work);
const assignment=one("SELECT * FROM agent_assignments WHERE id=?",I.assignment);
const role=one("SELECT * FROM goal_role_results WHERE id=?",I.roleResult);
const lifecycle=one("SELECT * FROM autonomous_lifecycle_checkpoints WHERE id=?",I.lifecycle);
const dispatch=one("SELECT * FROM goal_work_dispatches WHERE work_item_id=?",I.work);

pass("same trial project exists",project?.id===I.project);
pass("same goal exists",goal?.id===I.goal);
pass("previous failed transaction rolled back - recovery 12/12 exhausted",
 recovery?.status==="exhausted" &&
 Number(recovery?.attempts)===12 &&
 Number(recovery?.max_attempts)===12
);
pass("previous failed transaction rolled back - job 8/8 failed",
 job?.status==="failed" &&
 Number(job?.attempts)===8 &&
 Number(job?.max_attempts)===8
);
pass("tester task still failed",task?.status==="failed");
pass("tester work still failed",work?.status==="failed");
pass("tester assignment still failed",assignment?.status==="failed");
pass("tester role result still failed",role?.status==="failed");
pass("lifecycle still failed",lifecycle?.status==="failed");
pass("dispatch still failed",dispatch?.status==="failed");

pass("recovery authority project",recovery?.project_id===I.project);
pass("recovery authority goal",recovery?.goal_id===I.goal);
pass("recovery authority work",recovery?.work_item_id===I.work);
pass("recovery authority assignment",recovery?.assignment_id===I.assignment);
pass("recovery authority task",recovery?.task_id===I.task);

console.log("\n--- JOB SCHEMA AUTHORITY ---");
const jobColumns=db.prepare("PRAGMA table_info(jobs)").all() as any[];
const names=new Set(jobColumns.map(x=>String(x.name)));
console.log(jobColumns.map(x=>x.name).join(", "));

pass("jobs has claimed_by",names.has("claimed_by"));
pass("jobs has claimed_at",names.has("claimed_at"));
pass("jobs has lease_expires_at",names.has("lease_expires_at"));
pass("jobs has heartbeat_at",names.has("heartbeat_at"));
pass("jobs does not require locked_by",!names.has("locked_by"));

const now=new Date().toISOString();

console.log("\n--- APPLYING CONTROLLED RE-ARM ---");

db.exec("BEGIN IMMEDIATE");
try{
 const r1=db.prepare(`
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
 `).run(now,I.recovery);
 if(Number(r1.changes)!==1) fail("Recovery update authority failed.");

 const r2=db.prepare(`
  UPDATE jobs
  SET status='queued',
      max_attempts=max_attempts+1,
      last_error=NULL,
      claimed_by=NULL,
      claimed_at=NULL,
      lease_expires_at=NULL,
      heartbeat_at=NULL,
      available_at=?,
      completed_at=NULL,
      updated_at=?
  WHERE id=?
    AND status='failed'
    AND attempts=8
    AND max_attempts=8
 `).run(now,now,I.job);
 if(Number(r2.changes)!==1) fail("Outer job update authority failed.");

 const r3=db.prepare(`
  UPDATE tasks
  SET status='queued',
      phase='recovering',
      error=NULL,
      updated_at=?
  WHERE id=?
    AND status='failed'
 `).run(now,I.task);
 if(Number(r3.changes)!==1) fail("Tester task update authority failed.");

 const r4=db.prepare(`
  UPDATE goal_work_items
  SET status='ready',
      completed_at=NULL,
      updated_at=?
  WHERE id=?
    AND status='failed'
 `).run(now,I.work);
 if(Number(r4.changes)!==1) fail("Tester work update authority failed.");

 const r5=db.prepare(`
  UPDATE agent_assignments
  SET status='assigned',
      completed_at=NULL,
      updated_at=?
  WHERE id=?
    AND status='failed'
 `).run(now,I.assignment);
 if(Number(r5.changes)!==1) fail("Assignment update authority failed.");

 const r6=db.prepare(`
  UPDATE goal_role_results
  SET status='running',
      error=NULL,
      completed_at=NULL,
      updated_at=?
  WHERE id=?
    AND status='failed'
 `).run(now,I.roleResult);
 if(Number(r6.changes)!==1) fail("Role result update authority failed.");

 const r7=db.prepare(`
  UPDATE autonomous_lifecycle_checkpoints
  SET stage='development',
      status='running',
      error=NULL,
      completed_at=NULL,
      updated_at=?
  WHERE id=?
    AND status='failed'
 `).run(now,I.lifecycle);
 if(Number(r7.changes)!==1) fail("Lifecycle update authority failed.");

 const r8=db.prepare(`
  UPDATE goal_work_dispatches
  SET status='queued',
      updated_at=?
  WHERE work_item_id=?
    AND job_id=?
    AND status='failed'
 `).run(now,I.work,I.job);
 if(Number(r8.changes)!==1) fail("Dispatch update authority failed.");

 db.exec("COMMIT");
}catch(error){
 try{db.exec("ROLLBACK");}catch{}
 throw error;
}

console.log("\n--- POST-COMMIT AUTHORITY ---");

const afterRecovery=one("SELECT * FROM team_recoveries WHERE id=?",I.recovery);
const afterJob=one("SELECT * FROM jobs WHERE id=?",I.job);
const afterTask=one("SELECT * FROM tasks WHERE id=?",I.task);
const afterWork=one("SELECT * FROM goal_work_items WHERE id=?",I.work);
const afterAssignment=one("SELECT * FROM agent_assignments WHERE id=?",I.assignment);
const afterRole=one("SELECT * FROM goal_role_results WHERE id=?",I.roleResult);
const afterLifecycle=one("SELECT * FROM autonomous_lifecycle_checkpoints WHERE id=?",I.lifecycle);
const afterDispatch=one("SELECT * FROM goal_work_dispatches WHERE work_item_id=?",I.work);

const checks=[
 ["same recovery identity",afterRecovery?.id===I.recovery],
 ["recovery attempts preserved at 12",Number(afterRecovery?.attempts)===12],
 ["recovery max extended to 15",Number(afterRecovery?.max_attempts)===15],
 ["recovery is recovering",afterRecovery?.status==="recovering"],
 ["same outer job identity",afterJob?.id===I.job],
 ["outer attempts preserved at 8",Number(afterJob?.attempts)===8],
 ["outer max extended to 9",Number(afterJob?.max_attempts)===9],
 ["outer job queued",afterJob?.status==="queued"],
 ["outer job unclaimed",afterJob?.claimed_by==null && afterJob?.claimed_at==null],
 ["tester task queued",afterTask?.status==="queued"],
 ["tester task recovering",afterTask?.phase==="recovering"],
 ["tester work ready",afterWork?.status==="ready"],
 ["same assignment identity",afterAssignment?.id===I.assignment],
 ["assignment assigned",afterAssignment?.status==="assigned"],
 ["same role result identity",afterRole?.id===I.roleResult],
 ["role result running",afterRole?.status==="running"],
 ["lifecycle running",afterLifecycle?.status==="running"],
 ["lifecycle still development",afterLifecycle?.stage==="development"],
 ["dispatch queued",afterDispatch?.status==="queued"]
] as const;

let failed=0;
for(const [name,ok] of checks){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok) failed++;
}

console.log("\n--- FINAL STATE ---");
console.log(JSON.stringify({
 recovery:{
  id:afterRecovery?.id,
  status:afterRecovery?.status,
  attempts:afterRecovery?.attempts,
  maxAttempts:afterRecovery?.max_attempts
 },
 job:{
  id:afterJob?.id,
  status:afterJob?.status,
  attempts:afterJob?.attempts,
  maxAttempts:afterJob?.max_attempts,
  claimedBy:afterJob?.claimed_by
 },
 task:{
  id:afterTask?.id,
  status:afterTask?.status,
  phase:afterTask?.phase,
  repairAttempts:afterTask?.repair_attempts
 },
 work:{id:afterWork?.id,status:afterWork?.status},
 assignment:{id:afterAssignment?.id,status:afterAssignment?.status},
 roleResult:{id:afterRole?.id,status:afterRole?.status},
 lifecycle:{
  id:afterLifecycle?.id,
  stage:afterLifecycle?.stage,
  status:afterLifecycle?.status
 },
 dispatch:{status:afterDispatch?.status}
},null,2));

if(failed) fail(`${failed} post-commit checks failed.`);

console.log("\n============================================================");
console.log(`BATCH 7.4K.2A: PASS (${checks.length}/${checks.length})`);
console.log("Same trial:               YES");
console.log("New project:              NO");
console.log("Workspace manually edited:NO");
console.log("Recovery reset:           NO");
console.log("Recovery:                 12/15");
console.log("Outer job:                queued 8/9");
console.log("AI calls:                 NONE");
console.log("GitHub calls:             NONE");
console.log("Runtime:                  STOPPED");
console.log("============================================================");
