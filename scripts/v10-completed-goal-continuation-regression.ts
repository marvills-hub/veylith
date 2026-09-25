import fs from"node:fs";
import path from"node:path";
import assert from"node:assert/strict";

const root=process.cwd();
const dbPath=path.join(root,"data","v10-completed-goal-continuation-regression.db");
try{fs.rmSync(dbPath,{force:true});}catch{}
process.env.DATABASE_PATH=dbPath;
process.env.AI_PROVIDER="none";

const {db}=await import("../src/database/database.js");
const {now}=await import("../src/config/config.js");
const {
 createProjectGoal,
 getProjectGoal,
 updateGoalStatus
}=await import("../src/goals/goal.repository.js");
const {
 prepareGoal,
 activateGoal
}=await import("../src/goals/goal.service.js");
const {
 createGoalTaskGraph,
 loadGoalTaskGraph
}=await import("../src/goals/goal-task-graph.service.js");
const {
 updateGoalWorkStatus
}=await import("../src/goals/goal-task-graph.repository.js");
const {
 synchronizeGoalExecution,
 goalExecutionState
}=await import("../src/team/goal-team-execution.service.js");

let passed=0;
const check=(name:string,condition:boolean)=>{
 assert.equal(condition,true,name);
 passed++;
 console.log(`PASS ${String(passed).padStart(2,"0")} ${name}`);
};

const time=now();
const projectId="prj_completed_goal_continuation";

db.prepare(`
 INSERT INTO projects(
  id,name,slug,workspace,status,phase,progress,
  created_at,updated_at,completed_at
 )VALUES(?,?,?,?,?,?,?,?,?,?)
`).run(
 projectId,
 "Completed Goal Continuation Regression",
 "completed-goal-continuation-regression",
 path.join(root,"workspaces","completed-goal-continuation-regression"),
 "active",
 "autonomous",
 0,
 time,
 time,
 null
);

const goal=createProjectGoal({
 projectId,
 title:"Completed goal recovery regression",
 objective:"Prove legacy completed development reopens for mandatory review and delivery.",
 priority:"normal",
 requirements:[{
  text:"Complete development before final review.",
  required:true
 }],
 acceptanceCriteria:[
  "Final review must precede delivery."
 ],
 constraints:[]
});

prepareGoal(goal.id);
activateGoal(goal.id);

createGoalTaskGraph(goal.id,{
 items:[
  {
   key:"architecture",
   title:"Architecture",
   description:"Design the project.",
   kind:"architecture",
   priority:90,
   dependencies:[],
   requirementIds:goal.requirements.map(x=>x.id),
   acceptanceCriterionIds:goal.acceptanceCriteria.map(x=>x.id)
  },
  {
   key:"implementation",
   title:"Implementation",
   description:"Implement the project.",
   kind:"implementation",
   priority:90,
   dependencies:["architecture"],
   requirementIds:goal.requirements.map(x=>x.id),
   acceptanceCriterionIds:goal.acceptanceCriteria.map(x=>x.id)
  },
  {
   key:"build-scripts",
   title:"Build Scripts",
   description:"Create build scripts.",
   kind:"implementation",
   priority:80,
   dependencies:["implementation"],
   requirementIds:goal.requirements.map(x=>x.id),
   acceptanceCriterionIds:goal.acceptanceCriteria.map(x=>x.id)
  },
  {
   key:"tests",
   title:"Tests",
   description:"Validate the project.",
   kind:"test",
   priority:80,
   dependencies:["implementation"],
   requirementIds:goal.requirements.map(x=>x.id),
   acceptanceCriterionIds:goal.acceptanceCriteria.map(x=>x.id)
  },
  {
   key:"readme",
   title:"README",
   description:"Document the project.",
   kind:"documentation",
   priority:70,
   dependencies:["implementation"],
   requirementIds:goal.requirements.map(x=>x.id),
   acceptanceCriterionIds:goal.acceptanceCriteria.map(x=>x.id)
  }
 ]
} as any);

let graph=loadGoalTaskGraph(goal.id);

for(const item of graph.items){
 updateGoalWorkStatus(item.id,"completed");
}

updateGoalStatus(goal.id,"completed");

const completedTime=now();
db.prepare(`
 UPDATE projects
 SET status='completed',
     phase='completed',
     progress=100,
     completed_at=?,
     updated_at=?
 WHERE id=?
`).run(completedTime,completedTime,projectId);

graph=loadGoalTaskGraph(goal.id);

check("legacy graph has exactly five development items",graph.items.length===5);
check("legacy graph is successful before continuation",goalExecutionState(goal.id).success===true);
check("legacy goal starts completed",getProjectGoal(goal.id)?.status==="completed");

let project=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId) as any;

check("legacy project starts completed",String(project.status)==="completed");
check("legacy project starts at 100 percent",Number(project.progress)===100);
check("legacy project has completed timestamp",Boolean(project.completed_at));

const first=synchronizeGoalExecution(goal.id);

check("terminal continuation created during synchronization",first.terminalContinuation.created===true);

graph=loadGoalTaskGraph(goal.id);
const reviews=graph.items.filter(x=>x.key==="v1-final-review");
const deliveries=graph.items.filter(x=>x.key==="v1-final-delivery");

check("exactly one final review created",reviews.length===1);
check("exactly one final delivery created",deliveries.length===1);

const review=reviews[0];
const delivery=deliveries[0];

check("review is review kind",review.kind==="review");
check("delivery is delivery kind",delivery.kind==="delivery");
check("delivery depends only on review",delivery.dependencies.length===1&&delivery.dependencies[0]==="v1-final-review");
check("review is runnable",["ready","running"].includes(review.status));
check("delivery remains blocked",["pending","blocked"].includes(delivery.status));

const reopenedGoal=getProjectGoal(goal.id)!;

check("completed goal reactivated",reopenedGoal.status==="active");
check("goal completed timestamp cleared",!reopenedGoal.completedAt);

project=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId) as any;

check("completed project reopened",String(project.status)==="active");
check("project phase returned to autonomous development",String(project.phase)==="autonomous_development");
check("project progress dropped below 100",Number(project.progress)<100);
check("project completed timestamp cleared",!project.completed_at);

const reviewDispatches=db.prepare(`
 SELECT *
 FROM goal_work_dispatches
 WHERE goal_id=? AND work_item_id=?
`).all(goal.id,review.id) as any[];

check("review autonomously dispatched exactly once",reviewDispatches.length===1);

const deliveryDispatches=db.prepare(`
 SELECT *
 FROM goal_work_dispatches
 WHERE goal_id=? AND work_item_id=?
`).all(goal.id,delivery.id) as any[];

check("delivery not dispatched before review",deliveryDispatches.length===0);

const second=synchronizeGoalExecution(goal.id);

check("second synchronization does not recreate continuation",second.terminalContinuation.created===false);

graph=loadGoalTaskGraph(goal.id);

check("still exactly one final review",graph.items.filter(x=>x.key==="v1-final-review").length===1);
check("still exactly one final delivery",graph.items.filter(x=>x.key==="v1-final-delivery").length===1);

const reviewDispatchesAfter=db.prepare(`
 SELECT *
 FROM goal_work_dispatches
 WHERE goal_id=? AND work_item_id=?
`).all(goal.id,review.id) as any[];

check("review dispatch remains exactly one",reviewDispatchesAfter.length===1);
check("goal remains active while terminal work remains",getProjectGoal(goal.id)?.status==="active");

const state=goalExecutionState(goal.id);

check("expanded goal is no longer successful",state.success===false);
check("expanded goal is not terminal",state.terminal===false);
check("expanded graph contains seven work items",state.total===7);
check("five original development items remain completed",state.completed===5);

console.log("");
console.log("============================================================");
console.log(`BATCH 7.4L.24E: PASS ${passed}/${passed}`);
console.log("Legacy completed goal reactivation: VERIFIED");
console.log("Project reopening:                  VERIFIED");
console.log("Final review dispatch:              VERIFIED");
console.log("Continuation idempotency:           VERIFIED");
console.log("AI calls:                           NONE");
console.log("GitHub calls:                       NONE");
console.log("============================================================");

db.close();
try{fs.rmSync(dbPath,{force:true});}catch{}