import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{db}from"../src/database/database.js";
import{persistProjectIntake}from"../src/goals/project-intake.service.js";
import{createGoalTaskGraph,loadGoalTaskGraph}from"../src/goals/goal-task-graph.service.js";
import{dispatchRunnableGoalWork}from"../src/goals/goal-work-dispatch.service.js";
import{goalExecutionState,isGoalManagedTask}from"../src/team/goal-team-execution.service.js";
import{executeGoalTeamTask,listGoalRoleResults}from"../src/team/goal-role-executor.service.js";

let passed=0,failed=0;
const check=(name,value,detail="")=>{
 if(value){console.log(`PASS ${name}`);passed++}
 else{console.log(`FAIL ${name}${detail?` - ${detail}`:""}`);failed++}
};
const count=(sql,...args)=>Number(db.prepare(sql).get(...args)?.count??0);
const token=crypto.randomBytes(6).toString("hex");
const projectId=`v10_multirole_${token}`;
const workspace=path.resolve(`workspaces/v10-multirole-${token}`);
const time=new Date().toISOString();
let goalId="";

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 7.2E - LIVE MULTI-ROLE CHAIN");
console.log("============================================================");
console.log(`Fixture: ${token}`);
console.log("AI: LIVE - Ollama Cloud");
console.log("Roles: Architect -> Planner -> Developer -> Tester -> Reviewer");
console.log("Generated files: ALLOWED");
console.log("Validation commands: ALLOWED");
console.log("GitHub API: NONE");
console.log("Pushes: NONE\n");

const workByKey=()=>Object.fromEntries(loadGoalTaskGraph(goalId).items.map(item=>[item.key,item]));
const dispatchForWork=workId=>db.prepare(`
 SELECT * FROM goal_work_dispatches
 WHERE goal_id=? AND work_item_id=?
 LIMIT 1
`).get(goalId,workId);
const taskForWork=workId=>{
 const dispatch=dispatchForWork(workId);
 return dispatch?db.prepare("SELECT * FROM tasks WHERE id=?").get(dispatch.task_id):null;
};
const runRole=async(key,expectedRole)=>{
 const work=workByKey()[key];
 check(`${key} work exists`,Boolean(work));
 check(`${key} is running`,work?.status==="running",`status=${work?.status}`);
 const task=taskForWork(work.id);
 check(`${key} task dispatched`,Boolean(task));
 check(`${key} task is goal managed`,task?isGoalManagedTask(task.id):false);
 if(!task)throw new Error(`No dispatched task for ${key}`);
 console.log(`\n--- EXECUTING ${expectedRole.toUpperCase()} ---`);
 const result=await executeGoalTeamTask(task);
 check(`${expectedRole} executor managed task`,result?.managed===true);
 check(`${expectedRole} role result completed`,result?.roleResult?.status==="completed",`status=${result?.roleResult?.status}`);
 check(`${expectedRole} role recorded correctly`,result?.roleResult?.role===expectedRole,`role=${result?.roleResult?.role}`);
 check(`${expectedRole} summary persisted`,Boolean(String(result?.roleResult?.summary||"").trim()));
 const after=workByKey()[key];
 check(`${key} work completed`,after?.status==="completed",`status=${after?.status}`);
 return result;
};

try{
 fs.mkdirSync(workspace,{recursive:true});

 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  `Veylith 7.2E Multi Role ${token}`,
  `v10-multirole-${token}`,
  "queued",
  "goal_intake",
  0,
  workspace,
  time,
  time
 );

 const intake=persistProjectIntake({
  projectId,
  request:[
   "Build a tiny dependency-free Node.js HTTP health-check service.",
   "GET /health must return HTTP 200 and JSON exactly compatible with {\"status\":\"ok\"}.",
   "Include an automated test.",
   "Keep the project minimal.",
   "Do not publish to GitHub."
  ].join(" ")
 },{
  title:"Tiny Node.js health-check service",
  objective:"Create and validate a minimal dependency-free Node.js HTTP health-check service.",
  priority:"normal",
  requirements:[
   {text:"Use Node.js with no runtime third-party dependencies.",required:true},
   {text:"Expose GET /health.",required:true},
   {text:"GET /health returns HTTP 200 JSON with status ok.",required:true},
   {text:"Include an automated test for the health endpoint.",required:true}
  ],
  acceptanceCriteria:[
   "The project contains a valid package.json.",
   "GET /health returns HTTP 200.",
   "GET /health returns JSON containing status equal to ok.",
   "An automated test command completes successfully."
  ],
  constraints:[
   {type:"scope",text:"Keep implementation minimal."},
   {type:"dependency",text:"Prefer Node.js built-in modules and zero runtime dependencies."},
   {type:"delivery",text:"Do not publish this fixture to GitHub."}
  ],
  assumptions:[
   "The local environment has Node.js available."
  ],
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
    title:"Design the health-check service",
    description:"Design a minimal dependency-free Node.js HTTP service with GET /health and automated validation.",
    kind:"architecture",
    priority:100,
    dependencies:[],
    requirementIds,
    acceptanceCriterionIds:acceptanceIds
   },
   {
    key:"plan",
    title:"Plan the health-check implementation",
    description:"Create the exact minimal implementation and test plan from the approved architecture.",
    kind:"analysis",
    priority:90,
    dependencies:["architecture"],
    requirementIds,
    acceptanceCriterionIds:acceptanceIds
   },
   {
    key:"implementation",
    title:"Implement the health-check service",
    description:"Create the service, package manifest, and automated tests in the project workspace.",
    kind:"implementation",
    priority:80,
    dependencies:["architecture","plan"],
    requirementIds,
    acceptanceCriterionIds:acceptanceIds
   },
   {
    key:"test",
    title:"Validate the health-check service",
    description:"Execute the generated project's validation commands and recover targeted failures if necessary.",
    kind:"test",
    priority:70,
    dependencies:["architecture","plan","implementation"],
    requirementIds,
    acceptanceCriterionIds:acceptanceIds
   },
   {
    key:"review",
    title:"Review the completed health-check service",
    description:"Review architecture, plan, implementation and validation evidence against the project requirements.",
    kind:"review",
    priority:60,
    dependencies:["architecture","plan","implementation","test"],
    requirementIds,
    acceptanceCriterionIds:acceptanceIds
   }
  ]
 });

 const initial=dispatchRunnableGoalWork(goalId);
 check("only architect initially dispatched",initial.length===1,`count=${initial.length}`);

 await runRole("architecture","architect");
 check("planner advanced to running",workByKey().plan?.status==="running",`status=${workByKey().plan?.status}`);

 await runRole("plan","planner");
 check("developer advanced to running",workByKey().implementation?.status==="running",`status=${workByKey().implementation?.status}`);

 await runRole("implementation","developer");

 console.log("\n--- GENERATED WORKSPACE ---");
 const files=fs.readdirSync(workspace,{recursive:true}).map(String).sort();
 console.log(files.join("\n"));
 check("developer generated project files",files.length>0,`files=${files.length}`);
 check("package.json generated",fs.existsSync(path.join(workspace,"package.json")));

 check("tester advanced to running",workByKey().test?.status==="running",`status=${workByKey().test?.status}`);

 await runRole("test","tester");
 check("reviewer advanced to running",workByKey().review?.status==="running",`status=${workByKey().review?.status}`);

 const reviewResult=await runRole("review","reviewer");

 console.log("\n--- FINAL ROLE AUTHORITY ---");
 const roles=listGoalRoleResults(goalId);
 const completedRoles=roles.filter(item=>item.status==="completed").map(item=>item.role);

 for(const role of["architect","planner","developer","tester","reviewer"]){
  check(`${role} has one completed durable result`,
   completedRoles.filter(item=>item===role).length===1);
 }

 check("exactly five role results",roles.length===5,`count=${roles.length}`);
 check("review payload exists",Boolean(reviewResult?.roleResult?.result?.review));
 check("review approved",reviewResult?.roleResult?.result?.review?.approved===true);

 console.log("\n--- FINAL GOAL STATE ---");
 const state=goalExecutionState(goalId);
 check("all five work items completed",state.completed===5,`completed=${state.completed}`);
 check("no running work remains",state.running===0,`running=${state.running}`);
 check("goal graph terminal",state.terminal===true);
 check("goal graph successful",state.success===true);

 check("five work dispatches persisted",count(`
  SELECT COUNT(*) count FROM goal_work_dispatches WHERE goal_id=?
 `,goalId)===5);

 check("five assignments persisted",count(`
  SELECT COUNT(*) count FROM agent_assignments WHERE goal_id=?
 `,goalId)===5);

 check("five team result memories persisted",count(`
  SELECT COUNT(*) count FROM project_memory
  WHERE project_id=? AND type='team_role_result'
 `,projectId)===5);

 console.log("\n--- VALIDATION EVIDENCE ---");
 const tester=roles.find(item=>item.role==="tester");
 check("tester result has validation",Boolean(tester?.result?.validation));
 check("validation reports success",tester?.result?.validation?.success===true);
 check("tester preserves development evidence",Boolean(tester?.result?.development));

 console.log("\n--- DELIVERY SAFETY ---");
 check("no delivery role executed",!roles.some(item=>item.role==="delivery"));
 check("no release exists",count(`
  SELECT COUNT(*) count FROM project_releases WHERE project_id=?
 `,projectId)===0);

 const project=db.prepare(`
  SELECT github_owner,github_repo,github_url,github_branch,github_commit,github_pushed_at
  FROM projects WHERE id=?
 `).get(projectId);

 check("no GitHub state written",
  !project?.github_owner&&!project?.github_repo&&!project?.github_url&&
  !project?.github_branch&&!project?.github_commit&&!project?.github_pushed_at);

 console.log("\n--- GENERATED PROJECT SUMMARY ---");
 console.log(`Workspace: ${workspace}`);
 console.log(`Files: ${files.length}`);
 console.log(`Role results: ${roles.length}`);
 console.log(`Validation success: ${tester?.result?.validation?.success===true}`);
 console.log(`Review approved: ${reviewResult?.roleResult?.result?.review?.approved===true}`);

}catch(error){
 console.error("\n7.2E MULTI-ROLE ERROR");
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

  if(fs.existsSync(workspace))fs.rmSync(workspace,{recursive:true,force:true});

  check("cleanup removed project",count("SELECT COUNT(*) count FROM projects WHERE id=?",projectId)===0);
  check("cleanup removed goal",!goalId||count("SELECT COUNT(*) count FROM project_goals WHERE id=?",goalId)===0);
  check("cleanup removed tasks",count("SELECT COUNT(*) count FROM tasks WHERE project_id=?",projectId)===0);
  check("cleanup removed jobs",count("SELECT COUNT(*) count FROM jobs WHERE project_id=?",projectId)===0);
  check("cleanup removed workspace",!fs.existsSync(workspace));
 }catch(error){
  console.error("CLEANUP ERROR");
  console.error(error);
  failed++;
 }

 console.log("\n============================================================");
 console.log(" BATCH 7.2E LIVE MULTI-ROLE RESULT");
 console.log(` Passed: ${passed}`);
 console.log(` Failed: ${failed}`);
 console.log(" Live AI: OLLAMA CLOUD");
 console.log(" Roles: Architect/Planner/Developer/Tester/Reviewer");
 console.log(" Development commands: ALLOWED");
 console.log(" GitHub API: NONE");
 console.log(" Pushes: NONE");
 console.log(" Version: unchanged");
 console.log("============================================================");

 if(failed){
  console.log(" BATCH 7.2E: NEEDS REPAIR");
  process.exitCode=1;
 }else{
  console.log(" BATCH 7.2E: PASS");
  console.log(" Autonomous multi-role development chain proven.");
 }
}

