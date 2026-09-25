import fs from"node:fs";
import path from"node:path";
import assert from"node:assert/strict";

const root=process.cwd();
const dbPath=path.join(root,"data","v10-terminal-continuation-regression.db");
try{fs.rmSync(dbPath,{force:true});}catch{}
process.env.DATABASE_PATH=dbPath;
process.env.AI_PROVIDER="none";

const {db}=await import("../src/database/database.js");
const {now}=await import("../src/config/config.js");
const {createProjectGoal}=await import("../src/goals/goal.repository.js");
const {prepareGoal,activateGoal}=await import("../src/goals/goal.service.js");
const {createGoalTaskGraph,loadGoalTaskGraph}=await import("../src/goals/goal-task-graph.service.js");
const {updateGoalWorkStatus}=await import("../src/goals/goal-task-graph.repository.js");
const {dispatchRunnableGoalWork,synchronizeGoalWorkDispatches}=await import("../src/goals/goal-work-dispatch.service.js");
const {completeGoalTaskExecution,goalExecutionState}=await import("../src/team/goal-team-execution.service.js");
const {ensureTerminalReviewDelivery}=await import("../src/orchestration/v1/continuation/terminal-continuation.service.js");

let passed=0;
const check=(name:string,condition:boolean)=>{
 assert.equal(condition,true,name);
 passed++;
 console.log(`PASS ${String(passed).padStart(2,"0")} ${name}`);
};

const time=now();
const projectId="prj_l14c_terminal_regression";

db.prepare(`
 INSERT INTO projects(
  id,name,slug,workspace,status,phase,progress,created_at,updated_at
 ) VALUES(?,?,?,?,?,?,?,?,?)
`).run(
 projectId,
 "L14C Terminal Continuation Regression",
 "l14c-terminal-continuation-regression",
 path.join(root,"workspaces","l14c-terminal-continuation-regression"),
 "active",
 "autonomous",
 0,
 time,
 time
);

const goal=createProjectGoal({
 projectId,
 title:"Terminal continuation regression",
 objective:"Prove that successful development automatically continues through mandatory final review and delivery.",
 priority:"normal",
 requirements:[
  {
   text:"Complete the implementation before final review.",
   required:true
  }
 ],
 acceptanceCriteria:[
  "Review must precede delivery."
 ],
 constraints:[]
});

prepareGoal(goal.id);
activateGoal(goal.id);
createGoalTaskGraph(goal.id,{
 items:[
  {
   key:"implementation",
   title:"Implementation",
   description:"Complete implementation.",
   kind:"implementation",
   priority:90,
   dependencies:[],
   requirementIds:goal.requirements.map(item=>item.id),
   acceptanceCriterionIds:goal.acceptanceCriteria.map(item=>item.id)
  },
  {
   key:"tests",
   title:"Tests",
   description:"Validate implementation.",
   kind:"test",
   priority:80,
   dependencies:["implementation"],
   requirementIds:goal.requirements.map(item=>item.id),
   acceptanceCriterionIds:goal.acceptanceCriteria.map(item=>item.id)
  },
  {
   key:"documentation",
   title:"Documentation",
   description:"Document implementation.",
   kind:"documentation",
   priority:70,
   dependencies:["implementation"],
   requirementIds:goal.requirements.map(item=>item.id),
   acceptanceCriterionIds:goal.acceptanceCriteria.map(item=>item.id)
  }
 ]
} as any);

let graph=loadGoalTaskGraph(goal.id);

check("initial graph has three development items",graph.items.length===3);
check("terminal review absent initially",!graph.items.some(x=>x.key==="v1-final-review"));
check("terminal delivery absent initially",!graph.items.some(x=>x.key==="v1-final-delivery"));

const implementation=graph.items.find(x=>x.key==="implementation")!;
updateGoalWorkStatus(implementation.id,"completed");

synchronizeGoalWorkDispatches(goal.id);
dispatchRunnableGoalWork(goal.id);

graph=loadGoalTaskGraph(goal.id);
const tests=graph.items.find(x=>x.key==="tests")!;
const docs=graph.items.find(x=>x.key==="documentation")!;

updateGoalWorkStatus(tests.id,"completed");

const before=ensureTerminalReviewDelivery(goal.id);
check("continuation is not eligible while documentation remains",before.eligible===false);
check("review still absent before final development completion",!loadGoalTaskGraph(goal.id).items.some(x=>x.key==="v1-final-review"));

const dispatchRows=db.prepare(`
 SELECT task_id,work_item_id
 FROM goal_work_dispatches
 WHERE goal_id=?
`).all(goal.id) as any[];

let docsDispatch=dispatchRows.find(row=>String(row.work_item_id)===docs.id);

if(!docsDispatch){
 dispatchRunnableGoalWork(goal.id);
 docsDispatch=(db.prepare(`
  SELECT task_id,work_item_id
  FROM goal_work_dispatches
  WHERE goal_id=? AND work_item_id=?
  LIMIT 1
 `).get(goal.id,docs.id) as any);
}

check("documentation has production dispatch",Boolean(docsDispatch?.task_id));

const advanced=completeGoalTaskExecution(String(docsDispatch.task_id));
check("production completion returned advancement",Boolean(advanced));
check("terminal continuation created at production boundary",advanced?.terminalContinuation?.created===true);

graph=loadGoalTaskGraph(goal.id);

const reviews=graph.items.filter(x=>x.key==="v1-final-review");
const deliveries=graph.items.filter(x=>x.key==="v1-final-delivery");

check("exactly one final review exists",reviews.length===1);
check("exactly one final delivery exists",deliveries.length===1);

const review=reviews[0];
const delivery=deliveries[0];

check("review kind is review",review.kind==="review");
check("delivery kind is delivery",delivery.kind==="delivery");
check("delivery depends only on final review",delivery.dependencies.length===1&&delivery.dependencies[0]==="v1-final-review");
check("review is runnable after development completes",["ready","running"].includes(review.status));
check("delivery remains blocked before review completes",["pending","blocked"].includes(delivery.status));

const reviewDispatch=db.prepare(`
 SELECT task_id
 FROM goal_work_dispatches
 WHERE goal_id=? AND work_item_id=?
 LIMIT 1
`).get(goal.id,review.id) as any;

check("review was autonomously dispatched",Boolean(reviewDispatch?.task_id));

const secondEnsure=ensureTerminalReviewDelivery(goal.id);
check("repeated terminal authority does not recreate chain",secondEnsure.created===false);

graph=loadGoalTaskGraph(goal.id);
check("still exactly one review after repeated authority",graph.items.filter(x=>x.key==="v1-final-review").length===1);
check("still exactly one delivery after repeated authority",graph.items.filter(x=>x.key==="v1-final-delivery").length===1);

const reviewAdvanced=completeGoalTaskExecution(String(reviewDispatch.task_id));
check("review production completion succeeds",Boolean(reviewAdvanced));

graph=loadGoalTaskGraph(goal.id);
const deliveryAfterReview=graph.items.find(x=>x.key==="v1-final-delivery")!;

check("review is completed",graph.items.find(x=>x.key==="v1-final-review")?.status==="completed");
check("delivery becomes runnable after review",["ready","running"].includes(deliveryAfterReview.status));

const deliveryDispatch=db.prepare(`
 SELECT task_id
 FROM goal_work_dispatches
 WHERE goal_id=? AND work_item_id=?
 LIMIT 1
`).get(goal.id,deliveryAfterReview.id) as any;

check("delivery was autonomously dispatched",Boolean(deliveryDispatch?.task_id));

const finalEnsure=ensureTerminalReviewDelivery(goal.id);
check("post-review authority remains idempotent",finalEnsure.created===false);

graph=loadGoalTaskGraph(goal.id);
check("final graph contains five items",graph.items.length===5);
check("final graph still has one review",graph.items.filter(x=>x.key==="v1-final-review").length===1);
check("final graph still has one delivery",graph.items.filter(x=>x.key==="v1-final-delivery").length===1);

const state=goalExecutionState(goal.id);
check("goal is not successful before delivery executes",state.success===false);
check("goal is not terminal before delivery executes",state.terminal===false);

console.log("");
console.log("============================================================");
console.log(`BATCH 7.4L.14C.2: PASS ${passed}/${passed}`);
console.log("Production completion boundary: VERIFIED");
console.log("Final review insertion:          VERIFIED");
console.log("Review -> delivery ordering:     VERIFIED");
console.log("Idempotency:                     VERIFIED");
console.log("AI calls:                        NONE");
console.log("GitHub calls:                    NONE");
console.log("============================================================");

db.close();
try{fs.rmSync(dbPath,{force:true});}catch{}
