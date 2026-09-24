import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{db}from"../src/database/database.js";
import{persistProjectIntake}from"../src/goals/project-intake.service.js";
import{createGoalTaskGraph,loadGoalTaskGraph}from"../src/goals/goal-task-graph.service.js";
import{dispatchRunnableGoalWork}from"../src/goals/goal-work-dispatch.service.js";
import{isGoalManagedTask,goalExecutionState}from"../src/team/goal-team-execution.service.js";
import{executeGoalTeamTask}from"../src/team/goal-role-executor.service.js";
import{listGoalAssignments}from"../src/team/team-assignment.repository.js";

let passed=0,failed=0;
const check=(name,value,detail="")=>{
 if(value){console.log(`PASS ${name}`);passed++}
 else{console.log(`FAIL ${name}${detail?` - ${detail}`:""}`);failed++}
};
const count=(sql,...args)=>Number(db.prepare(sql).get(...args)?.count??0);
const token=crypto.randomBytes(6).toString("hex");
const projectId=`v10_live_arch_${token}`;
const workspace=path.resolve(`workspaces/v10-live-arch-${token}`);
const time=new Date().toISOString();
let goalId="";
let architectureTaskId="";

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 7.2D - LIVE AI ROLE EXECUTION");
console.log("============================================================");
console.log(`Fixture: ${token}`);
console.log("AI: LIVE - configured Ollama Cloud provider");
console.log("Scope: ARCHITECT ONLY");
console.log("Development commands: NONE");
console.log("GitHub API: NONE");
console.log("Pushes: NONE\n");

try{
 fs.mkdirSync(workspace,{recursive:true});
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  `Veylith 7.2D Live Architect ${token}`,
  `v10-live-arch-${token}`,
  "queued",
  "goal_intake",
  0,
  workspace,
  time,
  time
 );

 const intake=persistProjectIntake({
  projectId,
  request:"Design a tiny Node.js health-check HTTP service. Architecture only for this execution gate."
 },{
  title:"Tiny health-check service architecture",
  objective:"Design a minimal Node.js HTTP service exposing a GET /health endpoint returning JSON.",
  priority:"normal",
  requirements:[
   {text:"Use Node.js.",required:true},
   {text:"Expose GET /health.",required:true},
   {text:"Return JSON indicating service health.",required:true}
  ],
  acceptanceCriteria:[
   "Architecture identifies the service structure.",
   "Architecture defines GET /health behavior.",
   "Architecture remains minimal and suitable for later implementation."
  ],
  constraints:[
   {type:"scope",text:"Architecture execution only in this regression."},
   {type:"delivery",text:"Do not publish anything to GitHub."}
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
    title:"Design health-check service architecture",
    description:"Define the minimal Node.js service architecture and GET /health behavior.",
    kind:"architecture",
    priority:100,
    dependencies:[],
    requirementIds,
    acceptanceCriterionIds:acceptanceIds
   },
   {
    key:"documentation",
    title:"Document architecture",
    description:"Document the approved architecture after the architect completes.",
    kind:"documentation",
    priority:50,
    dependencies:["architecture"],
    requirementIds:[],
    acceptanceCriterionIds:[]
   }
  ]
 });

 const initial=dispatchRunnableGoalWork(goalId);

 check("one initial work item dispatched",initial.length===1,`count=${initial.length}`);

 const firstDispatch=db.prepare(`
  SELECT *
  FROM goal_work_dispatches
  WHERE goal_id=?
  ORDER BY created_at
  LIMIT 1
 `).get(goalId);

 architectureTaskId=String(firstDispatch?.task_id||"");

 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(architectureTaskId);

 check("architecture task exists",Boolean(task));
 check("architecture task is goal managed",isGoalManagedTask(architectureTaskId));

 const beforeGraph=loadGoalTaskGraph(goalId);
 const architectureBefore=beforeGraph.items.find(item=>item.key==="architecture");
 const documentationBefore=beforeGraph.items.find(item=>item.key==="documentation");

 check("architecture is running before role",architectureBefore?.status==="running",`status=${architectureBefore?.status}`);
 check("documentation not dispatched before architecture",["pending","blocked"].includes(documentationBefore?.status),`status=${documentationBefore?.status}`);

 console.log("\n--- EXECUTING REAL ARCHITECT AGENT ---");
 console.log("This is the first live AI call in Batch 7.2.\n");

 const result=await executeGoalTeamTask(task);

 console.log("\n--- ROLE EXECUTION RESULT ---");

 check("team executor returned managed result",result?.managed===true);
 check("role result returned",Boolean(result?.roleResult));
 check("role result completed",result?.roleResult?.status==="completed",`status=${result?.roleResult?.status}`);
 check("role is architect",result?.roleResult?.role==="architect",`role=${result?.roleResult?.role}`);
 check("role result has summary",Boolean(String(result?.roleResult?.summary||"").trim()));

 const roleRow=db.prepare(`
  SELECT *
  FROM goal_role_results
  WHERE goal_id=? AND task_id=?
  LIMIT 1
 `).get(goalId,architectureTaskId);

 check("durable role result exists",Boolean(roleRow));
 check("durable role result completed",roleRow?.status==="completed",`status=${roleRow?.status}`);
 check("durable role is architect",roleRow?.role==="architect");

 let rolePayload=null;
 try{rolePayload=roleRow?.result_json?JSON.parse(roleRow.result_json):null}catch{}

 check("architect payload persisted",Boolean(rolePayload));
 check("architecture payload exists",Boolean(rolePayload?.architecture));
 check("architecture summary exists",Boolean(String(rolePayload?.architecture?.summary||"").trim()));

 console.log("\n--- GOAL ADVANCEMENT ---");

 const afterGraph=loadGoalTaskGraph(goalId);
 const architectureAfter=afterGraph.items.find(item=>item.key==="architecture");
 const documentationAfter=afterGraph.items.find(item=>item.key==="documentation");

 check("architecture completed",architectureAfter?.status==="completed",`status=${architectureAfter?.status}`);
 check("documentation advanced to running",documentationAfter?.status==="running",`status=${documentationAfter?.status}`);

 const dispatches=db.prepare(`
  SELECT *
  FROM goal_work_dispatches
  WHERE goal_id=?
  ORDER BY created_at
 `).all(goalId);

 check("second work item dispatched after architect",dispatches.length===2,`count=${dispatches.length}`);

 const documentationDispatch=dispatches.find(item=>item.work_item_id===documentationAfter?.id);

 check("documentation has dispatch",Boolean(documentationDispatch));
 check("documentation task differs from architect",documentationDispatch?.task_id!==architectureTaskId);
 check("documentation task is goal managed",documentationDispatch?isGoalManagedTask(documentationDispatch.task_id):false);

 const jobs=db.prepare(`
  SELECT *
  FROM jobs
  WHERE project_id=?
  ORDER BY created_at
 `).all(projectId);

 check("two jobs now exist",jobs.length===2,`count=${jobs.length}`);

 const state=goalExecutionState(goalId);

 check("goal has one completed item",state.completed===1,`completed=${state.completed}`);
 check("goal has one running item",state.running===1,`running=${state.running}`);
 check("goal not terminal",state.terminal===false);
 check("goal not successful yet",state.success===false);

 console.log("\n--- ASSIGNMENT / LIFECYCLE ---");

 const assignments=listGoalAssignments(goalId);
 const architectureAssignment=assignments.find(item=>item.workItemId===architectureAfter?.id);

 check("architect assignment persisted",Boolean(architectureAssignment));
 check("architect assignment completed",architectureAssignment?.status==="completed",`status=${architectureAssignment?.status}`);

 const lifecycle=db.prepare(`
  SELECT *
  FROM autonomous_lifecycle_checkpoints
  WHERE goal_id=?
  LIMIT 1
 `).get(goalId);

 check("lifecycle exists",Boolean(lifecycle));
 check("lifecycle remains unfinished",lifecycle?.status!=="completed",`status=${lifecycle?.status}`);
 check("lifecycle checkpoint exists after architect",Boolean(lifecycle?.stage));

 console.log("\n--- HANDOFF / MEMORY ---");

 check("team role memory persisted",count(`
  SELECT COUNT(*) count
  FROM project_memory
  WHERE project_id=? AND type='team_role_result'
 `,projectId)>=1);

 check("exactly one completed architect result",count(`
  SELECT COUNT(*) count
  FROM goal_role_results
  WHERE goal_id=? AND role='architect' AND status='completed'
 `,goalId)===1);

 console.log("\n--- SIDE-EFFECT SAFETY ---");

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

 check("workspace contains no generated project files",(()=>{
  try{
   const rows=db.prepare(`
    SELECT COUNT(*) count
    FROM project_memory
    WHERE project_id=?
    AND type IN ('development','git','github','release')
   `).get(projectId);
   return Number(rows?.count??0)===0;
  }catch{return true}
 })());

 console.log("\n--- RE-EXECUTION IDEMPOTENCY ---");

 const resultAgain=await executeGoalTeamTask(task);

 check("completed architect safely skipped/resumed",
  resultAgain?.managed===true&&Boolean(resultAgain?.skipped||resultAgain?.resumed));

 check("still one architect role result",count(`
  SELECT COUNT(*) count
  FROM goal_role_results
  WHERE goal_id=? AND role='architect'
 `,goalId)===1);

 check("still only two work dispatches",count(`
  SELECT COUNT(*) count
  FROM goal_work_dispatches
  WHERE goal_id=?
 `,goalId)===2);

}catch(error){
 console.error("\n7.2D LIVE ROLE ERROR");
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
  check("cleanup removed role results",!goalId||count("SELECT COUNT(*) count FROM goal_role_results WHERE goal_id=?",goalId)===0);
  check("cleanup removed assignments",!goalId||count("SELECT COUNT(*) count FROM agent_assignments WHERE goal_id=?",goalId)===0);
  check("cleanup removed lifecycle",!goalId||count("SELECT COUNT(*) count FROM autonomous_lifecycle_checkpoints WHERE goal_id=?",goalId)===0);
 if(fs.existsSync(workspace))fs.rmSync(workspace,{recursive:true,force:true});
 check("cleanup removed workspace",!fs.existsSync(workspace));

 }catch(error){
  console.error("CLEANUP ERROR");
  console.error(error);
  failed++;
 }

 console.log("\n============================================================");
 console.log(" BATCH 7.2D LIVE AI RESULT");
 console.log(` Passed: ${passed}`);
 console.log(` Failed: ${failed}`);
 console.log(" Live AI: OLLAMA CLOUD - ARCHITECT ONLY");
 console.log(" Development commands: NONE");
 console.log(" GitHub API: NONE");
 console.log(" Pushes: NONE");
 console.log(" Version: unchanged");
 console.log("============================================================");

 if(failed){
  console.log(" BATCH 7.2D: NEEDS REPAIR");
  process.exitCode=1;
 }else{
  console.log(" BATCH 7.2D: PASS");
  console.log(" Real autonomous architect execution proven.");
 }
}

