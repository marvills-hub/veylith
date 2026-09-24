import crypto from"node:crypto";
import{db}from"../src/database/database.js";
import{
 beginAutonomousLifecycle,
 waitAutonomousLifecycle,
 failAutonomousLifecycle,
 autonomousLifecycleState
}from"../src/orchestration/v1/lifecycle/lifecycle.service.js";

const suffix=crypto.randomBytes(6).toString("hex");
const projectId=`v10_resume_project_${suffix}`;
const goalId=`v10_resume_goal_${suffix}`;
const now=new Date().toISOString();
let failures=0;

function check(name:string,ok:boolean){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok)failures++;
}

try{
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,progress,workspace,created_at,updated_at,phase
  ) VALUES(?,?,?,'active',0,?,?,?,'development')
 `).run(
  projectId,
  "Lifecycle Resume Regression",
  projectId,
  `workspaces/${projectId}`,
  now,
  now
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,priority,
   requirements_json,acceptance_criteria_json,constraints_json,
   created_at,updated_at
  ) VALUES(?,?,?,?,'active',0,'[]','[]','[]',?,?)
 `).run(
  goalId,
  projectId,
  "Lifecycle Resume",
  "Verify resumed goal work resurrects recoverable lifecycle state.",
  now,
  now
 );

 beginAutonomousLifecycle({
  projectId,
  goalId,
  taskId:`task_a_${suffix}`,
  workItemId:`work_a_${suffix}`
 });

 let state=autonomousLifecycleState(goalId);

 check(
  "new lifecycle starts running",
  state?.status==="running"
 );

 check(
  "new lifecycle starts in development",
  state?.stage==="development"
 );

 waitAutonomousLifecycle(
  goalId,
  new Error("temporary provider outage")
 );

 state=autonomousLifecycleState(goalId);

 check(
  "provider outage becomes waiting",
  state?.status==="waiting"
 );

 check(
  "provider error retained while waiting",
  String(state?.error||"").includes("temporary provider outage")
 );

 beginAutonomousLifecycle({
  projectId,
  goalId,
  taskId:`task_b_${suffix}`,
  workItemId:`work_b_${suffix}`
 });

 state=autonomousLifecycleState(goalId);

 check(
  "waiting lifecycle resumes running",
  state?.status==="running"
 );

 check(
  "waiting lifecycle error clears",
  state?.error==null
 );

 failAutonomousLifecycle(
  goalId,
  new Error("stale execution failure")
 );

 state=autonomousLifecycleState(goalId);

 check(
  "fixture enters failed state",
  state?.status==="failed"
 );

 beginAutonomousLifecycle({
  projectId,
  goalId,
  taskId:`task_c_${suffix}`,
  workItemId:`work_c_${suffix}`
 });

 state=autonomousLifecycleState(goalId);

 check(
  "failed lifecycle resurrects running",
  state?.status==="running"
 );

 check(
  "resurrected lifecycle error clears",
  state?.error==null
 );

 check(
  "resurrected lifecycle remains incomplete",
  state?.status!=="completed"&&state?.completedAt==null
 );

 console.log(
  `LIFECYCLE RESURRECTION: ${10-failures}/10`
 );
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
