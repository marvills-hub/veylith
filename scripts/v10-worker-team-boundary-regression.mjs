import crypto from"node:crypto";
import{db}from"../src/database/database.js";
import{persistProjectIntake}from"../src/goals/project-intake.service.js";
import{createGoalTaskGraph,loadGoalTaskGraph}from"../src/goals/goal-task-graph.service.js";
import{dispatchRunnableGoalWork}from"../src/goals/goal-work-dispatch.service.js";
import{
 isGoalManagedTask,
 goalExecutionForTask,
 prepareGoalTaskExecution,
 goalExecutionState,
 goalExecutionSnapshot
}from"../src/team/goal-team-execution.service.js";
import{listGoalAssignments}from"../src/team/team-assignment.repository.js";
import{roleForWorkKind}from"../src/team/team-role.service.js";
import{beginAutonomousLifecycle}from"../src/orchestration/v1/lifecycle/lifecycle.service.js";

let passed=0,failed=0;
const check=(name,value,detail="")=>{
 if(value){console.log(`PASS ${name}`);passed++}
 else{console.log(`FAIL ${name}${detail?` - ${detail}`:""}`);failed++}
};
const count=(sql,...args)=>Number(db.prepare(sql).get(...args)?.count??0);
const token=crypto.randomBytes(6).toString("hex");
const projectId=`v10_worker_project_${token}`;
const workspace=`workspaces/v10-worker-${token}`;
const time=new Date().toISOString();
let goalId="";
let taskId="";
let jobId="";

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 7.2C - WORKER / TEAM BOUNDARY");
console.log("============================================================");
console.log(`Fixture: ${token}`);
console.log("Live AI: NONE");
console.log("GitHub API: NONE");
console.log("Pushes: NONE\n");

try{
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  `Veylith 7.2C Worker ${token}`,
  `v10-worker-${token}`,
  "queued",
  "goal_intake",
  0,
  workspace,
  time,
  time
 );

 const intake=persistProjectIntake({
  projectId,
  request:"Prove a dispatched v1 architecture task crosses into deterministic team preparation without invoking AI."
 },{
  title:"Worker team boundary",
  objective:"Verify goal-managed worker preparation and architect assignment.",
  priority:"normal",
  requirements:[
   {text:"Architecture work must be assigned to the architect role.",required:true},
   {text:"The task must remain inside the goal-managed execution path.",required:true}
  ],
  acceptanceCriteria:[
   "One architecture task is dispatched",
   "The task resolves to the same goal and work item",
   "Preparation creates exactly one working architect assignment",
   "No AI role result is executed during this regression"
  ],
  constraints:[
   {type:"scope",text:"Do not invoke live AI or GitHub."}
  ],
  assumptions:[],
  clarificationNeeded:false,
  clarificationQuestions:[]
 });

 goalId=intake.goal.id;
 const requirementIds=intake.goal.requirements.map(item=>item.id);
 const acceptanceIds=intake.goal.acceptanceCriteria.map(item=>item.id);

 createGoalTaskGraph(goalId,{
  items:[
   {
    key:"architecture",
    title:"Design deterministic architecture",
    description:"Prepare architecture through the v1 autonomous team boundary.",
    kind:"architecture",
    priority:90,
    dependencies:[],
    requirementIds,
    acceptanceCriterionIds:acceptanceIds
   }
  ]
 });

 const dispatched=dispatchRunnableGoalWork(goalId);
 check("exactly one runnable work item dispatched",dispatched.length===1,`count=${dispatched.length}`);

 const dispatch=db.prepare(`
  SELECT *
  FROM goal_work_dispatches
  WHERE goal_id=?
  LIMIT 1
 `).get(goalId);

 taskId=String(dispatch?.task_id||"");
 jobId=String(dispatch?.job_id||"");

 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId);
 const job=db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);

 console.log("\n--- DISPATCH / WORKER ROUTING ---");

 check("dispatch created task",Boolean(task));
 check("dispatch created job",Boolean(job));
 check("job points to dispatched task",job?.task_id===taskId);
 check("job points to same project",job?.project_id===projectId);
 check("job is queued",job?.status==="queued",`status=${job?.status}`);
 check("task is goal managed",isGoalManagedTask(taskId));

 const managed=goalExecutionForTask(taskId);

 check("task resolves goal",managed?.goal?.id===goalId);
 check("task resolves dispatched work",managed?.workItemId===dispatch?.work_item_id);

 const before=goalExecutionState(goalId);
 check("one running graph item before preparation",before.running===1,`running=${before.running}`);
 check("goal not terminal before execution",before.terminal===false);
 check("goal not successful before execution",before.success===false);

 console.log("\n--- ROLE AUTHORITY ---");

 const graphBefore=loadGoalTaskGraph(goalId);
 const work=graphBefore.items.find(item=>item.id===managed?.workItemId);

 check("work item exists",Boolean(work));
 check("work kind is architecture",work?.kind==="architecture",`kind=${work?.kind}`);
 check("architecture maps to architect",roleForWorkKind(String(work?.kind))==="architect");

 console.log("\n--- TEAM PREPARATION ---");

 const prepared=prepareGoalTaskExecution(taskId);

 check("preparation returns managed execution",Boolean(prepared));
 check("preparation is not terminal",prepared?.alreadyTerminal===false);
 check("prepared goal matches",prepared?.goalId===goalId);
 check("prepared work matches",prepared?.workItemId===managed?.workItemId);
 check("assignment created",Boolean(prepared?.assignment));
 check("assignment role is architect",prepared?.assignment?.role==="architect",`role=${prepared?.assignment?.role}`);
 check("preparation returned assigned or working assignment",["assigned","working"].includes(prepared?.assignment?.status),`status=${prepared?.assignment?.status}`);
 check("assignment belongs to same goal",prepared?.assignment?.goalId===goalId);
 check("assignment belongs to same project",prepared?.assignment?.projectId===projectId);
 check("assignment belongs to same work",prepared?.assignment?.workItemId===managed?.workItemId);

 const assignments=listGoalAssignments(goalId);

 check("exactly one assignment persisted",assignments.length===1,`count=${assignments.length}`);
 check("persisted assignment is architect",assignments[0]?.role==="architect");
 check("persisted assignment is working",assignments[0]?.status==="working");

 const preparedAgain=prepareGoalTaskExecution(taskId);
 const assignmentsAgain=listGoalAssignments(goalId);

 check("second preparation reuses assignment",preparedAgain?.assignment?.id===prepared?.assignment?.id);
 check("second preparation creates no duplicate assignment",assignmentsAgain.length===1,`count=${assignmentsAgain.length}`);

 console.log("\n--- PROJECT / GOAL STATE ---");

 const after=goalExecutionState(goalId);
 const project=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId);

 check("goal still has one running work item",after.running===1,`running=${after.running}`);
 check("goal still not terminal",after.terminal===false);
 check("goal still not successful",after.success===false);
 check("project moved to active",project?.status==="active",`status=${project?.status}`);
 check("project moved to autonomous development",project?.phase==="autonomous_development",`phase=${project?.phase}`);
 check("project progress remains zero before completion",Number(project?.progress)===0,`progress=${project?.progress}`);

 const snapshot=goalExecutionSnapshot(goalId);

 check("snapshot has one dispatch",snapshot.dispatches.length===1);
 check("snapshot has one assignment",snapshot.assignments.length===1);
 check("snapshot preserves running state",snapshot.state.running===1);

 console.log("\n--- LIFECYCLE BOUNDARY ---");

 check("no lifecycle exists before role executor begins",
  count("SELECT COUNT(*) count FROM autonomous_lifecycle_checkpoints WHERE goal_id=?",goalId)===0);

 const lifecycle=beginAutonomousLifecycle({
  projectId,
  goalId,
  taskId,
  workItemId:String(managed?.workItemId)
 });

 const persistedLifecycle=db.prepare(`
  SELECT *
  FROM autonomous_lifecycle_checkpoints
  WHERE goal_id=?
  LIMIT 1
 `).get(goalId);

 check("lifecycle created at worker/team boundary",Boolean(lifecycle));
 check("lifecycle persisted",Boolean(persistedLifecycle));
 check("lifecycle belongs to goal",persistedLifecycle?.goal_id===goalId);
 check("lifecycle belongs to project",persistedLifecycle?.project_id===projectId);
 check("lifecycle tracks current task",persistedLifecycle?.task_id===taskId);
 check("lifecycle tracks current work",persistedLifecycle?.work_item_id===managed?.workItemId);

 console.log("\n--- STOP-BEFORE-AI SAFETY ---");

 check("no role result exists",count(`
  SELECT COUNT(*) count
  FROM goal_role_results
  WHERE goal_id=?
 `,goalId)===0);

 check("no team result memory exists",count(`
  SELECT COUNT(*) count
  FROM project_memory
  WHERE project_id=? AND type='team_role_result'
 `,projectId)===0);

 check("work has not been completed",loadGoalTaskGraph(goalId).items[0]?.status==="running");
 check("assignment has not been completed",listGoalAssignments(goalId)[0]?.status==="working");

 check("no release exists",count(`
  SELECT COUNT(*) count
  FROM project_releases
  WHERE project_id=?
 `,projectId)===0);

 check("no GitHub state written",(()=>{
  const row=db.prepare(`
   SELECT github_owner,github_repo,github_url,github_branch,github_commit,github_pushed_at
   FROM projects
   WHERE id=?
  `).get(projectId);
  return !row?.github_owner&&!row?.github_repo&&!row?.github_url&&!row?.github_branch&&!row?.github_commit&&!row?.github_pushed_at;
 })());

 console.log("\n--- DATABASE INVARIANTS ---");

 check("one goal only",count("SELECT COUNT(*) count FROM project_goals WHERE project_id=?",projectId)===1);
 check("one work item only",count("SELECT COUNT(*) count FROM goal_work_items WHERE goal_id=?",goalId)===1);
 check("one dispatch only",count("SELECT COUNT(*) count FROM goal_work_dispatches WHERE goal_id=?",goalId)===1);
 check("one task only",count("SELECT COUNT(*) count FROM tasks WHERE project_id=?",projectId)===1);
 check("one job only",count("SELECT COUNT(*) count FROM jobs WHERE project_id=?",projectId)===1);
 check("one assignment only",count("SELECT COUNT(*) count FROM agent_assignments WHERE goal_id=?",goalId)===1);
 check("one lifecycle only",count("SELECT COUNT(*) count FROM autonomous_lifecycle_checkpoints WHERE goal_id=?",goalId)===1);

}catch(error){
 console.error("\n7.2C TEST ERROR");
 console.error(error);
 failed++;
}finally{
 console.log("\n--- CLEANUP ---");

 try{
  db.exec("BEGIN IMMEDIATE");
  try{
   if(goalId){
    db.prepare("DELETE FROM autonomous_lifecycle_checkpoints WHERE goal_id=?").run(goalId);
    db.prepare("DELETE FROM goal_role_results WHERE goal_id=?").run(goalId);

    db.prepare("DELETE FROM agent_assignments WHERE goal_id=?").run(goalId);
    db.prepare("DELETE FROM development_cycles WHERE goal_id=?").run(goalId);
    db.prepare("DELETE FROM development_milestones WHERE goal_id=?").run(goalId);
    db.prepare("DELETE FROM development_sessions WHERE goal_id=?").run(goalId);
    db.prepare("DELETE FROM goal_work_dispatches WHERE goal_id=?").run(goalId);
    db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId);
    db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId);
   }

   db.prepare("DELETE FROM project_releases WHERE project_id=?").run(projectId);
   db.prepare("DELETE FROM project_memory WHERE project_id=?").run(projectId);
   db.prepare("DELETE FROM jobs WHERE project_id=?").run(projectId);
   db.prepare("DELETE FROM tasks WHERE project_id=?").run(projectId);
   db.prepare("DELETE FROM projects WHERE id=?").run(projectId);

   db.exec("COMMIT");
  }catch(error){
   db.exec("ROLLBACK");
   throw error;
  }

  check("cleanup removed project",count("SELECT COUNT(*) count FROM projects WHERE id=?",projectId)===0);
  check("cleanup removed goal",!goalId||count("SELECT COUNT(*) count FROM project_goals WHERE id=?",goalId)===0);
  check("cleanup removed tasks",count("SELECT COUNT(*) count FROM tasks WHERE project_id=?",projectId)===0);
  check("cleanup removed jobs",count("SELECT COUNT(*) count FROM jobs WHERE project_id=?",projectId)===0);
  check("cleanup removed assignments",!goalId||count("SELECT COUNT(*) count FROM agent_assignments WHERE goal_id=?",goalId)===0);
  check("cleanup removed lifecycle",!goalId||count("SELECT COUNT(*) count FROM autonomous_lifecycle_checkpoints WHERE goal_id=?",goalId)===0);

 }catch(error){
  console.error("CLEANUP ERROR");
  console.error(error);
  failed++;
 }

 console.log("\n============================================================");
 console.log(" BATCH 7.2C BEHAVIORAL RESULT");
 console.log(` Passed: ${passed}`);
 console.log(` Failed: ${failed}`);
 console.log(" Live AI: NONE");
 console.log(" GitHub API: NONE");
 console.log(" Pushes: NONE");
 console.log(" Version: unchanged");
 console.log("============================================================");

 if(failed){
  console.log(" BATCH 7.2C: NEEDS REPAIR");
  process.exitCode=1;
 }else{
  console.log(" BATCH 7.2C: PASS");
  console.log(" Worker -> goal -> team -> lifecycle boundary proven.");
 }
}


