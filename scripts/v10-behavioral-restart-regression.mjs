import crypto from"node:crypto";
import{db}from"../src/database/database.js";
import{recoverAutonomousLifecycles}from"../src/orchestration/v1/lifecycle/lifecycle-recovery.service.js";
import{
 ensureLifecycleCheckpoint,
 lifecycleCheckpoint
}from"../src/orchestration/v1/lifecycle/lifecycle.repository.js";

let passed=0;
let failed=0;

function check(name,value,detail=""){
 if(value){
  console.log(`PASS ${name}`);
  passed++;
 }else{
  console.log(`FAIL ${name}${detail?` - ${detail}`:""}`);
  failed++;
 }
}

function scalar(sql,...args){
 const row=db.prepare(sql).get(...args);
 return Number(row?.count??0);
}

const token=crypto.randomBytes(6).toString("hex");
const projectId=`v10_recovery_project_${token}`;
const goalId=`v10_recovery_goal_${token}`;
const workId=`v10_recovery_work_${token}`;
const sessionId=`v10_recovery_session_${token}`;
const milestoneId=`v10_recovery_milestone_${token}`;
const slug=`v10-recovery-test-${token}`;
const now=new Date().toISOString();
const workspace=`C:\\VEYLITH\\veylith\\workspaces\\${slug}`;

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 7.1E - BEHAVIORAL RESTART PROOF");
console.log("============================================================");
console.log(`Disposable project: ${projectId}`);
console.log("Live AI: NONE");
console.log("GitHub API: NONE");
console.log("Pushes: NONE\n");

try{
 db.exec("BEGIN IMMEDIATE");
 try{
  db.prepare(`
   INSERT INTO projects(
    id,name,slug,status,progress,workspace,created_at,updated_at,phase,summary
   )VALUES(?,?,?,?,?,?,?,?,?,?)
  `).run(
   projectId,
   "Veylith v1.0 Recovery Test",
   slug,
   "running",
   25,
   workspace,
   now,
   now,
   "development",
   "Disposable Batch 7.1E behavioral recovery fixture"
  );

  db.prepare(`
   INSERT INTO project_goals(
    id,project_id,title,objective,status,priority,
    requirements_json,acceptance_criteria_json,constraints_json,
    created_at,updated_at,activated_at
   )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
   goalId,
   projectId,
   "Recover interrupted autonomous development",
   "Prove persisted v1 lifecycle recovery is restart safe.",
   "active",
   "normal",
   JSON.stringify([{
    id:`req_${token}`,
    text:"Persist and recover interrupted work",
    required:true,
    status:"pending"
   }]),
   JSON.stringify([{
    id:`acc_${token}`,
    text:"Recovery preserves one durable work graph",
    status:"pending"
   }]),
   "[]",
   now,
   now,
   now
  );

  db.prepare(`
   INSERT INTO goal_work_items(
    id,goal_id,project_id,work_key,title,description,kind,status,
    priority,dependencies_json,requirement_ids_json,acceptance_ids_json,
    created_at,updated_at,started_at
   )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
   workId,
   goalId,
   projectId,
   "development",
   "Continue development",
   "Disposable interrupted development work.",
   "development",
   "running",
   50,
   "[]",
   JSON.stringify([`req_${token}`]),
   JSON.stringify([`acc_${token}`]),
   now,
   now,
   now
  );

  db.prepare(`
   INSERT INTO development_sessions(
    id,project_id,goal_id,status,current_milestone_id,progress,
    recovery_count,last_checkpoint_at,pause_reason,failure,
    started_at,paused_at,resumed_at,completed_at,created_at,updated_at
   )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
   sessionId,
   projectId,
   goalId,
   "paused",
   milestoneId,
   25,
   0,
   now,
   "Simulated process interruption",
   null,
   now,
   now,
   null,
   null,
   now,
   now
  );

  db.prepare(`
   INSERT INTO development_milestones(
    id,session_id,project_id,goal_id,milestone_key,title,description,
    sequence,status,work_item_ids_json,progress,started_at,completed_at,
    created_at,updated_at
   )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
   milestoneId,
   sessionId,
   projectId,
   goalId,
   "development",
   "Development",
   "Disposable recovery milestone",
   1,
   "active",
   JSON.stringify([workId]),
   25,
   now,
   null,
   now,
   now
  );

  db.exec("COMMIT");
 }catch(error){
  db.exec("ROLLBACK");
  throw error;
 }

 const initial=ensureLifecycleCheckpoint({
  projectId,
  goalId,
  stage:"development",
  workItemId:workId
 });

 check("fixture project persisted",
  scalar("SELECT COUNT(*) count FROM projects WHERE id=?",projectId)===1);
 check("fixture goal persisted",
  scalar("SELECT COUNT(*) count FROM project_goals WHERE id=?",goalId)===1);
 check("fixture work item persisted",
  scalar("SELECT COUNT(*) count FROM goal_work_items WHERE id=?",workId)===1);
 check("fixture development session persisted",
  scalar("SELECT COUNT(*) count FROM development_sessions WHERE id=?",sessionId)===1);
 check("fixture lifecycle persisted",Boolean(initial));
 check("fixture starts paused",
  db.prepare("SELECT status FROM development_sessions WHERE id=?").get(sessionId)?.status==="paused");

 console.log("\n--- FIRST RECOVERY PASS ---");
 const first=recoverAutonomousLifecycles();
 const firstLifecycle=lifecycleCheckpoint(goalId);
 const firstSession=db.prepare(`
  SELECT status,recovery_count
  FROM development_sessions
  WHERE id=?
 `).get(sessionId);

 check("first recovery processes disposable lifecycle",
  Boolean(firstLifecycle)&&Number(firstSession?.recovery_count)===1);
 check("first recovery resumes paused development session",
  firstSession?.status==="active",
  `status=${firstSession?.status}`);
 check("first recovery increments recovery count once",
  Number(firstSession?.recovery_count)===1,
  `count=${firstSession?.recovery_count}`);
 check("first recovery preserves lifecycle",
  Boolean(firstLifecycle));
 check("first recovery keeps lifecycle recoverable",
  ["running","waiting","delivering"].includes(firstLifecycle?.status??""),
  `status=${firstLifecycle?.status}`);
 check("first recovery does not create another project",
  scalar("SELECT COUNT(*) count FROM projects WHERE id=?",projectId)===1);
 check("first recovery does not create another goal",
  scalar("SELECT COUNT(*) count FROM project_goals WHERE id=?",goalId)===1);
 check("first recovery does not duplicate work",
  scalar("SELECT COUNT(*) count FROM goal_work_items WHERE goal_id=?",goalId)===1);
 check("first recovery does not duplicate session",
  scalar("SELECT COUNT(*) count FROM development_sessions WHERE project_id=?",projectId)===1);
 check("first recovery does not create release",
  scalar("SELECT COUNT(*) count FROM project_releases WHERE project_id=?",projectId)===0);

 console.log("\n--- SECOND RECOVERY PASS / SIMULATED NEXT RESTART ---");
 const second=recoverAutonomousLifecycles();
 const secondLifecycle=lifecycleCheckpoint(goalId);
 const secondSession=db.prepare(`
  SELECT status,recovery_count
  FROM development_sessions
  WHERE id=?
 `).get(sessionId);

 check("second recovery processes same lifecycle",
  secondLifecycle?.id===firstLifecycle?.id&&Number(secondSession?.recovery_count)===2);
 check("second recovery keeps same session active",
  secondSession?.status==="active");
 check("second recovery increments recovery counter only",
  Number(secondSession?.recovery_count)===2,
  `count=${secondSession?.recovery_count}`);
 check("second recovery keeps same lifecycle identity",
  secondLifecycle?.id===firstLifecycle?.id);
 check("second recovery still has one project",
  scalar("SELECT COUNT(*) count FROM projects WHERE id=?",projectId)===1);
 check("second recovery still has one goal",
  scalar("SELECT COUNT(*) count FROM project_goals WHERE id=?",goalId)===1);
 check("second recovery still has one work item",
  scalar("SELECT COUNT(*) count FROM goal_work_items WHERE goal_id=?",goalId)===1);
 check("second recovery still has one development session",
  scalar("SELECT COUNT(*) count FROM development_sessions WHERE project_id=?",projectId)===1);
 check("second recovery still has one lifecycle checkpoint",
  scalar("SELECT COUNT(*) count FROM autonomous_lifecycle_checkpoints WHERE goal_id=?",goalId)===1);
 check("second recovery creates no publication dispatch",
  scalar("SELECT COUNT(*) count FROM goal_work_dispatches WHERE project_id=?",projectId)===0);
 check("second recovery creates no role execution",
  scalar("SELECT COUNT(*) count FROM goal_role_results WHERE project_id=?",projectId)===0);
 check("second recovery creates no release",
  scalar("SELECT COUNT(*) count FROM project_releases WHERE project_id=?",projectId)===0);

 console.log("\n--- DURABLE IDENTITY PROOF ---");
 const sameCheckpoint=ensureLifecycleCheckpoint({
  projectId,
  goalId,
  stage:"development",
  workItemId:workId
 });

 check("ensure lifecycle remains idempotent",
  sameCheckpoint.id===initial.id);
 check("goal work unique topology preserved",
  scalar(`
   SELECT COUNT(*) count
   FROM goal_work_items
   WHERE goal_id=? AND work_key='development'
  `,goalId)===1);
 check("no GitHub state written to disposable project",(()=>{
  const row=db.prepare(`
   SELECT github_owner,github_repo,github_url,github_commit,github_pushed_at
   FROM projects WHERE id=?
  `).get(projectId);
  return !row?.github_owner&&!row?.github_repo&&!row?.github_url&&!row?.github_commit&&!row?.github_pushed_at;
 })());

}catch(error){
 console.error("\nBEHAVIORAL TEST ERROR");
 console.error(error);
 failed++;
}finally{
 console.log("\n--- CLEANUP ---");
 try{
  db.exec("BEGIN IMMEDIATE");
  try{
   db.prepare("DELETE FROM autonomous_lifecycle_checkpoints WHERE goal_id=?").run(goalId);
   db.prepare("DELETE FROM development_cycles WHERE goal_id=?").run(goalId);
   db.prepare("DELETE FROM development_milestones WHERE goal_id=?").run(goalId);
   db.prepare("DELETE FROM development_sessions WHERE goal_id=?").run(goalId);
   db.prepare("DELETE FROM goal_role_results WHERE goal_id=?").run(goalId);
   db.prepare("DELETE FROM goal_work_dispatches WHERE goal_id=?").run(goalId);
   db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId);
   db.prepare("DELETE FROM project_releases WHERE project_id=?").run(projectId);
   db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId);
   db.prepare("DELETE FROM projects WHERE id=?").run(projectId);
   db.exec("COMMIT");
  }catch(error){
   db.exec("ROLLBACK");
   throw error;
  }

  check("cleanup removed lifecycle",
   scalar("SELECT COUNT(*) count FROM autonomous_lifecycle_checkpoints WHERE goal_id=?",goalId)===0);
  check("cleanup removed development session",
   scalar("SELECT COUNT(*) count FROM development_sessions WHERE goal_id=?",goalId)===0);
  check("cleanup removed work",
   scalar("SELECT COUNT(*) count FROM goal_work_items WHERE goal_id=?",goalId)===0);
  check("cleanup removed goal",
   scalar("SELECT COUNT(*) count FROM project_goals WHERE id=?",goalId)===0);
  check("cleanup removed project",
   scalar("SELECT COUNT(*) count FROM projects WHERE id=?",projectId)===0);
 }catch(error){
  console.error("CLEANUP ERROR");
  console.error(error);
  failed++;
 }
}

console.log("\n============================================================");
console.log(" BATCH 7.1E BEHAVIORAL RESULT");
console.log(` Passed: ${passed}`);
console.log(` Failed: ${failed}`);
console.log(" Live AI: NONE");
console.log(" GitHub API: NONE");
console.log(" Pushes: NONE");
console.log(" Version: unchanged");
console.log("============================================================");

if(failed){
 console.log(" BATCH 7.1E: NEEDS REPAIR");
 process.exitCode=1;
}else{
 console.log(" BATCH 7.1E: PASS");
 console.log(" Persistent restart recovery behavior proven.");
}

