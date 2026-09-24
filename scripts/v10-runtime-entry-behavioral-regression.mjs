import crypto from"node:crypto";
import{db}from"../src/database/database.js";
import{persistProjectIntake}from"../src/goals/project-intake.service.js";
import{createGoalTaskGraph}from"../src/goals/goal-task-graph.service.js";
import{dispatchRunnableGoalWork}from"../src/goals/goal-work-dispatch.service.js";
import{isGoalManagedTask,goalExecutionForTask}from"../src/team/goal-team-execution.service.js";

let passed=0,failed=0;
const check=(name,value,detail="")=>{
 if(value){console.log(`PASS ${name}`);passed++}
 else{console.log(`FAIL ${name}${detail?` - ${detail}`:""}`);failed++}
};
const count=(sql,...args)=>Number(db.prepare(sql).get(...args)?.count??0);
const token=crypto.randomBytes(6).toString("hex");
const projectId=`v10_entry_project_${token}`;
const workspace=`workspaces/v10-entry-${token}`;
const time=new Date().toISOString();
let goalId="";

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 7.2B - BEHAVIORAL RUNTIME ENTRY");
console.log("============================================================");
console.log(`Disposable project: ${projectId}`);
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
  `Veylith 7.2B Runtime ${token}`,
  `v10-entry-${token}`,
  "queued",
  "goal_intake",
  0,
  workspace,
  time,
  time
 );

 const intake=persistProjectIntake({
  projectId,
  request:"Create a deterministic disposable project proving the v1 goal-managed runtime entry."
 },{
  title:"Deterministic runtime integration",
  objective:"Prove v1 autonomous work enters the goal-managed queue without a legacy root task.",
  priority:"normal",
  requirements:[
   {text:"Create architecture before implementation",required:true},
   {text:"Execute work through the v1 goal-managed queue",required:true}
  ],
  acceptanceCriteria:[
   "Initial runnable work is dispatched exactly once",
   "Every generated task is goal-managed",
   "No legacy root autonomous task exists"
  ],
  constraints:[
   {type:"scope",text:"Behavioral regression only; do not invoke live AI or GitHub."}
  ],
  assumptions:[],
  clarificationNeeded:false,
  clarificationQuestions:[]
 });

 goalId=intake.goal.id;

 const goal=intake.goal;
 const requirementIds=goal.requirements.map(item=>item.id);
 const acceptanceIds=goal.acceptanceCriteria.map(item=>item.id);

 check("fixture uses persisted requirement ids",requirementIds.length===2,`count=${requirementIds.length}`);
 check("fixture uses persisted acceptance ids",acceptanceIds.length===3,`count=${acceptanceIds.length}`);

 const graph=createGoalTaskGraph(goalId,{
  items:[
   {
    key:"architecture",
    title:"Design disposable architecture",
    description:"Create architecture for the deterministic runtime fixture.",
    kind:"architecture",
    priority:80,
    dependencies:[],
    requirementIds:[requirementIds[0]],
    acceptanceCriterionIds:[acceptanceIds[0]]
   },
   {
    key:"implementation",
    title:"Implement disposable project",
    description:"Implement only after architecture completes.",
    kind:"implementation",
    priority:70,
    dependencies:["architecture"],
    requirementIds:[requirementIds[1]],
    acceptanceCriterionIds:[acceptanceIds[1],acceptanceIds[2]]
   }
  ]
 });

 const initial=dispatchRunnableGoalWork(goalId);

 db.prepare(`
  UPDATE projects
  SET status='queued',phase='autonomous',progress=0,updated_at=?
  WHERE id=?
 `).run(new Date().toISOString(),projectId);

 const project=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId);
 const persistedGoal=db.prepare("SELECT * FROM project_goals WHERE id=?").get(goalId);
 const work=db.prepare("SELECT * FROM goal_work_items WHERE goal_id=? ORDER BY work_key").all(goalId);
 const dispatches=db.prepare("SELECT * FROM goal_work_dispatches WHERE goal_id=? ORDER BY created_at").all(goalId);
 const tasks=db.prepare("SELECT * FROM tasks WHERE project_id=? ORDER BY created_at").all(projectId);
 const jobs=db.prepare("SELECT * FROM jobs WHERE project_id=? ORDER BY created_at").all(projectId);

 console.log("\n--- PERSISTED V1 TOPOLOGY ---");

 check("one autonomous project exists",Boolean(project));
 check("project enters autonomous phase",project?.phase==="autonomous",`phase=${project?.phase}`);
 check("project remains queued",project?.status==="queued",`status=${project?.status}`);
 check("one goal exists",count("SELECT COUNT(*) count FROM project_goals WHERE project_id=?",projectId)===1);
 check("goal belongs to project",persistedGoal?.project_id===projectId);
 check("goal prepared for execution",["ready","active"].includes(persistedGoal?.status),`status=${persistedGoal?.status}`);

 check("two work items persisted",work.length===2,`count=${work.length}`);
 check("graph reports two items",graph.items.length===2,`count=${graph.items.length}`);

 const architecture=work.find(item=>item.work_key==="architecture");
 const implementation=work.find(item=>item.work_key==="implementation");

 check("architecture persisted",Boolean(architecture));
 check("implementation persisted",Boolean(implementation));
 check("architecture moved to running after dispatch",architecture?.status==="running",`status=${architecture?.status}`);
 check("implementation remains undispatched",["pending","blocked"].includes(implementation?.status),`status=${implementation?.status}`);

 check("exactly one initial dispatch",initial.length===1,`count=${initial.length}`);
 check("exactly one persisted dispatch",dispatches.length===1,`count=${dispatches.length}`);
 check("only architecture dispatched",dispatches[0]?.work_item_id===architecture?.id);
 check("exactly one generated task",tasks.length===1,`count=${tasks.length}`);
 check("exactly one generated job",jobs.length===1,`count=${jobs.length}`);
 check("dispatch references generated task",dispatches[0]?.task_id===tasks[0]?.id);
 check("dispatch references generated job",dispatches[0]?.job_id===jobs[0]?.id);

 const task=tasks[0];
 check("generated task is goal managed",Boolean(task)&&isGoalManagedTask(task.id));

 const managed=task?goalExecutionForTask(task.id):null;
 check("managed task resolves same goal",managed?.goal?.id===goalId);
 check("managed task resolves architecture work",managed?.workItemId===architecture?.id);

 console.log("\n--- COVERAGE AUTHORITY ---");

 const architectureReq=JSON.parse(architecture?.requirement_ids_json||"[]");
 const architectureAcc=JSON.parse(architecture?.acceptance_ids_json||"[]");
 const implementationReq=JSON.parse(implementation?.requirement_ids_json||"[]");
 const implementationAcc=JSON.parse(implementation?.acceptance_ids_json||"[]");
 const coveredReq=new Set([...architectureReq,...implementationReq]);
 const coveredAcc=new Set([...architectureAcc,...implementationAcc]);

 check("all required requirements covered",requirementIds.every(id=>coveredReq.has(id)));
 check("all acceptance criteria covered",acceptanceIds.every(id=>coveredAcc.has(id)));

 console.log("\n--- LEGACY ROOT TASK EXCLUSION ---");

 check("all tasks backed by goal dispatch",tasks.every(item=>
  count("SELECT COUNT(*) count FROM goal_work_dispatches WHERE task_id=? AND goal_id=?",item.id,goalId)===1
 ));

 check("zero undispatched legacy root tasks",count(`
  SELECT COUNT(*) count
  FROM tasks t
  WHERE t.project_id=?
  AND NOT EXISTS(
   SELECT 1 FROM goal_work_dispatches d WHERE d.task_id=t.id
  )
 `,projectId)===0);

 check("zero legacy execution_mode memory",count(`
  SELECT COUNT(*) count FROM project_memory
  WHERE project_id=? AND type='execution_mode'
 `,projectId)===0);

 check("zero legacy task_result memory",count(`
  SELECT COUNT(*) count FROM project_memory
  WHERE project_id=? AND type='task_result'
 `,projectId)===0);

 check("no GitHub state written",(()=>{
  const row=db.prepare(`
   SELECT github_owner,github_repo,github_url,github_branch,github_commit,github_pushed_at
   FROM projects WHERE id=?
  `).get(projectId);
  return !row?.github_owner&&!row?.github_repo&&!row?.github_url&&!row?.github_branch&&!row?.github_commit&&!row?.github_pushed_at;
 })());

 console.log("\n--- DISPATCH IDEMPOTENCY ---");

 const beforeTasks=tasks.length;
 const beforeJobs=jobs.length;
 const beforeDispatches=dispatches.length;
 const second=dispatchRunnableGoalWork(goalId);

 const afterTasks=count("SELECT COUNT(*) count FROM tasks WHERE project_id=?",projectId);
 const afterJobs=count("SELECT COUNT(*) count FROM jobs WHERE project_id=?",projectId);
 const afterDispatches=count("SELECT COUNT(*) count FROM goal_work_dispatches WHERE goal_id=?",goalId);

 check("second dispatch creates no new runnable task",second.length===0,`created=${second.length}`);
 check("task count unchanged",afterTasks===beforeTasks,`${beforeTasks}->${afterTasks}`);
 check("job count unchanged",afterJobs===beforeJobs,`${beforeJobs}->${afterJobs}`);
 check("dispatch count unchanged",afterDispatches===beforeDispatches,`${beforeDispatches}->${afterDispatches}`);

 console.log("\n--- PRE-WORKER SAFETY ---");

 check("no lifecycle before worker execution",count(`
  SELECT COUNT(*) count FROM autonomous_lifecycle_checkpoints WHERE goal_id=?
 `,goalId)===0);

 check("no role execution during bootstrap",count(`
  SELECT COUNT(*) count FROM goal_role_results WHERE goal_id=?
 `,goalId)===0);

 check("no release during bootstrap",count(`
  SELECT COUNT(*) count FROM project_releases WHERE project_id=?
 `,projectId)===0);

}catch(error){
 console.error("\nBEHAVIORAL TEST ERROR");
 console.error(error);
 failed++;
}finally{
 console.log("\n--- CLEANUP ---");
 if(projectId){
  try{
   db.exec("BEGIN IMMEDIATE");
   try{
    if(goalId){
     const taskIds=db.prepare("SELECT task_id FROM goal_work_dispatches WHERE goal_id=?").all(goalId).map(row=>row.task_id);
     db.prepare("DELETE FROM autonomous_lifecycle_checkpoints WHERE goal_id=?").run(goalId);
     db.prepare("DELETE FROM development_cycles WHERE goal_id=?").run(goalId);
     db.prepare("DELETE FROM development_milestones WHERE goal_id=?").run(goalId);
     db.prepare("DELETE FROM development_sessions WHERE goal_id=?").run(goalId);
     db.prepare("DELETE FROM goal_role_results WHERE goal_id=?").run(goalId);
     for(const taskId of taskIds)db.prepare("DELETE FROM jobs WHERE task_id=?").run(taskId);
     db.prepare("DELETE FROM goal_work_dispatches WHERE goal_id=?").run(goalId);
     db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId);
     db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId);
    }
    db.prepare("DELETE FROM project_releases WHERE project_id=?").run(projectId);
    db.prepare("DELETE FROM project_memory WHERE project_id=?").run(projectId);
    db.prepare("DELETE FROM tasks WHERE project_id=?").run(projectId);
    db.prepare("DELETE FROM jobs WHERE project_id=?").run(projectId);
    db.prepare("DELETE FROM projects WHERE id=?").run(projectId);
    db.exec("COMMIT");
   }catch(error){
    db.exec("ROLLBACK");
    throw error;
   }

   check("cleanup removed project",count("SELECT COUNT(*) count FROM projects WHERE id=?",projectId)===0);
   check("cleanup removed goal",!goalId||count("SELECT COUNT(*) count FROM project_goals WHERE id=?",goalId)===0);
   check("cleanup removed work",!goalId||count("SELECT COUNT(*) count FROM goal_work_items WHERE goal_id=?",goalId)===0);
   check("cleanup removed dispatches",!goalId||count("SELECT COUNT(*) count FROM goal_work_dispatches WHERE goal_id=?",goalId)===0);
   check("cleanup removed tasks",count("SELECT COUNT(*) count FROM tasks WHERE project_id=?",projectId)===0);
   check("cleanup removed jobs",count("SELECT COUNT(*) count FROM jobs WHERE project_id=?",projectId)===0);
  }catch(error){
   console.error("CLEANUP ERROR");
   console.error(error);
   failed++;
  }
 }

 console.log("\n============================================================");
 console.log(" BATCH 7.2B BEHAVIORAL RESULT");
 console.log(` Passed: ${passed}`);
 console.log(` Failed: ${failed}`);
 console.log(" Live AI: NONE");
 console.log(" GitHub API: NONE");
 console.log(" Pushes: NONE");
 console.log(" Version: unchanged");
 console.log("============================================================");

 if(failed){
  console.log(" BATCH 7.2B: NEEDS REPAIR");
  process.exitCode=1;
 }else{
  console.log(" BATCH 7.2B: PASS");
  console.log(" Goal-managed production topology behavior proven.");
 }
}
