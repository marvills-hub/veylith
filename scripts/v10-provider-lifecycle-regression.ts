import crypto from"node:crypto";
import{db}from"../src/database/database.js";
import{beginAutonomousLifecycle,waitAutonomousLifecycle,failAutonomousLifecycle,autonomousLifecycleState}from"../src/orchestration/v1/lifecycle/lifecycle.service.js";

const suffix=crypto.randomBytes(6).toString("hex");
const projectId=`v10_provider_project_${suffix}`;
const goalId=`v10_provider_goal_${suffix}`;
const now=new Date().toISOString();
let failures=0;

function check(name:string,ok:boolean){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok)failures++;
}

try{
 db.prepare(`
  INSERT INTO projects(
   id,
   name,
   slug,
   status,
   progress,
   workspace,
   created_at,
   updated_at,
   phase
  ) VALUES(?,?,?,'active',0,?,?,?,'development')
 `).run(
  projectId,
  "Provider Recovery Regression",
  projectId,
  `workspaces/${projectId}`,
  now,
  now
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,
   project_id,
   title,
   objective,
   status,
   priority,
   requirements_json,
   acceptance_criteria_json,
   constraints_json,
   created_at,
   updated_at
  ) VALUES(?,?,?,?,'active',0,'[]','[]','[]',?,?)
 `).run(
  goalId,
  projectId,
  "Provider Recovery",
  "Verify retryable provider failures suspend rather than terminate autonomous lifecycle execution.",
  now,
  now
 );

 beginAutonomousLifecycle({
  projectId,
  goalId,
  taskId:`task_${suffix}`,
  workItemId:`work_${suffix}`
 });

 let state=autonomousLifecycleState(goalId);

 check("lifecycle starts running",state?.status==="running");
 check("lifecycle starts development",state?.stage==="development");

 waitAutonomousLifecycle(
  goalId,
  new Error("temporary provider outage")
 );

 state=autonomousLifecycleState(goalId);

 check("provider outage becomes waiting",state?.status==="waiting");
 check("waiting lifecycle remains nonterminal",state?.status!=="completed");
 check(
  "temporary provider error retained",
  String(state?.error||"").includes("temporary provider outage")
 );

 failAutonomousLifecycle(
  goalId,
  new Error("permanent execution failure")
 );

 state=autonomousLifecycleState(goalId);

 check("ordinary failure remains terminal",state?.status==="failed");
 check(
  "permanent failure retained",
  String(state?.error||"").includes("permanent execution failure")
 );

 console.log(`PROVIDER LIFECYCLE REGRESSION: ${7-failures}/7`);
}catch(error){
 console.error(error);
 failures++;
}finally{
 try{
  db.prepare(
   "DELETE FROM autonomous_lifecycle_checkpoints WHERE goal_id=?"
  ).run(goalId);
 }catch{}

 try{
  db.prepare(
   "DELETE FROM project_goals WHERE id=?"
  ).run(goalId);
 }catch{}

 try{
  db.prepare(
   "DELETE FROM projects WHERE id=?"
  ).run(projectId);
 }catch{}
}

process.exitCode=failures?1:0;
