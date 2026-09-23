import {createGoal,prepareGoal} from "../dist/goals/goal.service.js";
import {deleteProjectGoal,getProjectGoal} from "../dist/goals/goal.repository.js";
import {
 createGoalTaskGraph,
 loadGoalTaskGraph,
 normalizeProposedTaskGraph,
 refreshGoalTaskReadiness,
 runnableGoalWork,
 topologicalOrder,
 validateProposedTaskGraph
} from "../dist/goals/goal-task-graph.service.js";
import {
 deleteGoalTaskGraph,
 getGoalWorkItem,
 updateGoalWorkStatus
} from "../dist/goals/goal-task-graph.repository.js";

let passed=0;
let failed=0;

function check(name,condition){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.error(`FAIL ${name}`);
 }
}

function expectThrow(name,fn){
 try{
  fn();
  failed++;
  console.error(`FAIL ${name}`);
 }catch{
  passed++;
  console.log(`PASS ${name}`);
 }
}

const projectId=`prj_graph_regression_${Date.now()}`;
let goalId="";

try{
 const draft=createGoal({
  projectId,
  title:"Autonomous task API",
  objective:"Implement and validate a task API",
  priority:"high",
  requirements:[
   {text:"Implement task CRUD",required:true},
   {text:"Protect endpoints with authentication",required:true}
  ],
  acceptanceCriteria:[
   "CRUD tests pass",
   "Unauthorized requests are rejected"
  ],
  constraints:[
   {type:"security",text:"Credentials must not be exposed"}
  ]
 });

 goalId=draft.id;
 const goal=prepareGoal(goalId);

 const r1=goal.requirements[0].id;
 const r2=goal.requirements[1].id;
 const a1=goal.acceptanceCriteria[0].id;
 const a2=goal.acceptanceCriteria[1].id;

 const proposal={
  items:[
   {
    key:"architecture",
    title:"Design API changes",
    description:"Determine minimal API and authentication architecture",
    kind:"architecture",
    priority:90,
    dependencies:[],
    requirementIds:[r1,r2],
    acceptanceCriterionIds:[]
   },
   {
    key:"crud",
    title:"Implement task CRUD",
    description:"Implement task CRUD behavior",
    kind:"implementation",
    priority:80,
    dependencies:["architecture"],
    requirementIds:[r1],
    acceptanceCriterionIds:[]
   },
   {
    key:"authentication",
    title:"Implement authentication",
    description:"Protect private task endpoints",
    kind:"implementation",
    priority:85,
    dependencies:["architecture"],
    requirementIds:[r2],
    acceptanceCriterionIds:[]
   },
   {
    key:"validation",
    title:"Validate task API",
    description:"Run automated CRUD and authentication validation",
    kind:"test",
    priority:70,
    dependencies:["crud","authentication"],
    requirementIds:[r1,r2],
    acceptanceCriterionIds:[a1,a2]
   }
  ]
 };

 const validation=validateProposedTaskGraph(goalId,proposal);
 check("valid graph accepted",validation.valid);

 const graph=createGoalTaskGraph(goalId,proposal);
 check("four work items persisted",graph.items.length===4);
 check("single root detected",graph.roots.length===1&&graph.roots[0]==="architecture");
 check("single leaf detected",graph.leaves.length===1&&graph.leaves[0]==="validation");
 check("execution order contains all work",graph.executionOrder.length===4);
 check("architecture ordered before CRUD",graph.executionOrder.indexOf("architecture")<graph.executionOrder.indexOf("crud"));
 check("architecture ordered before authentication",graph.executionOrder.indexOf("architecture")<graph.executionOrder.indexOf("authentication"));
 check("validation ordered after CRUD",graph.executionOrder.indexOf("validation")>graph.executionOrder.indexOf("crud"));
 check("validation ordered after authentication",graph.executionOrder.indexOf("validation")>graph.executionOrder.indexOf("authentication"));

 let readiness=refreshGoalTaskReadiness(goalId);
 check("root becomes ready",readiness.graph.items.find(x=>x.key==="architecture")?.status==="ready");
 check("dependent implementation remains pending",readiness.graph.items.find(x=>x.key==="crud")?.status==="pending");
 check("only root runnable initially",runnableGoalWork(goalId).map(x=>x.key).join(",")==="architecture");

 const architecture=readiness.graph.items.find(x=>x.key==="architecture");
 updateGoalWorkStatus(architecture.id,"running");
 updateGoalWorkStatus(architecture.id,"completed");

 readiness=refreshGoalTaskReadiness(goalId);
 check("CRUD becomes ready",readiness.graph.items.find(x=>x.key==="crud")?.status==="ready");
 check("authentication becomes ready",readiness.graph.items.find(x=>x.key==="authentication")?.status==="ready");
 check("validation still pending",readiness.graph.items.find(x=>x.key==="validation")?.status==="pending");
 check("priority orders runnable siblings",runnableGoalWork(goalId)[0]?.key==="authentication");

 for(const workKey of ["crud","authentication"]){
  const item=loadGoalTaskGraph(goalId).items.find(x=>x.key===workKey);
  updateGoalWorkStatus(item.id,"running");
  updateGoalWorkStatus(item.id,"completed");
 }

 readiness=refreshGoalTaskReadiness(goalId);
 check("validation becomes ready after dependencies",readiness.graph.items.find(x=>x.key==="validation")?.status==="ready");

 const validationItem=readiness.graph.items.find(x=>x.key==="validation");
 updateGoalWorkStatus(validationItem.id,"completed");
 check("work status persisted",getGoalWorkItem(validationItem.id)?.status==="completed");

 const normalized=normalizeProposedTaskGraph({
  items:[
   {key:" API Setup ","title":" Setup ","description":" Setup API ","kind":"IMPLEMENTATION",priority:500},
   {key:"API Setup","title":"Second","description":"Second task","kind":"unknown",priority:-5}
  ]
 });
 check("keys normalized and deduplicated",normalized.items[0].key==="api-setup"&&normalized.items[1].key==="api-setup-2");
 check("priority upper bounded",normalized.items[0].priority===100);
 check("priority lower bounded",normalized.items[1].priority===0);
 check("unknown kind becomes other",normalized.items[1].kind==="other");

 expectThrow("unknown dependency rejected",()=>topologicalOrder([
  {key:"a",dependencies:["missing"]}
 ]));

 expectThrow("self dependency rejected",()=>topologicalOrder([
  {key:"a",dependencies:["a"]}
 ]));

 expectThrow("dependency cycle rejected",()=>topologicalOrder([
  {key:"a",dependencies:["b"]},
  {key:"b",dependencies:["a"]}
 ]));

 const missingCoverage=validateProposedTaskGraph(goalId,{
  items:[{
   key:"partial",
   title:"Partial",
   description:"Partial implementation",
   kind:"implementation",
   priority:50,
   dependencies:[],
   requirementIds:[r1],
   acceptanceCriterionIds:[a1]
  }]
 });
 check("missing requirement coverage rejected",missingCoverage.problems.some(x=>x.includes("Required requirement not covered")));
 check("missing acceptance coverage rejected",missingCoverage.problems.some(x=>x.includes("Acceptance criterion not covered")));

 const unknownReference=validateProposedTaskGraph(goalId,{
  items:[{
   key:"bad",
   title:"Bad references",
   description:"Bad references",
   kind:"other",
   priority:50,
   dependencies:[],
   requirementIds:[r1,r2,"req_missing"],
   acceptanceCriterionIds:[a1,a2,"acc_missing"]
  }]
 });
 check("unknown requirement reference rejected",unknownReference.problems.some(x=>x.includes("unknown requirement")));
 check("unknown acceptance reference rejected",unknownReference.problems.some(x=>x.includes("unknown acceptance criterion")));

 check("goal remains persisted",Boolean(getProjectGoal(goalId)));
 check("graph cleanup removes work",deleteGoalTaskGraph(goalId)===4);
 check("goal cleanup",deleteProjectGoal(goalId));
}catch(error){
 failed++;
 console.error(error);
 if(goalId){
  try{deleteGoalTaskGraph(goalId);}catch{}
  try{deleteProjectGoal(goalId);}catch{}
 }
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 1 PASS 3");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 1 PASS 3 PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 1 PASS 3 FAILED");
 process.exitCode=1;
}
