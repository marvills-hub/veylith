import {db} from "../dist/database/database.js";
import {createGoal,prepareGoal} from "../dist/goals/goal.service.js";
import {deleteProjectGoal} from "../dist/goals/goal.repository.js";
import {
 createGoalTaskGraph,
 refreshGoalTaskReadiness,
 loadGoalTaskGraph
} from "../dist/goals/goal-task-graph.service.js";
import {
 updateGoalWorkStatus,
 deleteGoalTaskGraph
} from "../dist/goals/goal-task-graph.repository.js";
import {
 assignRunnableGoalTeam
} from "../dist/team/team-assignment.service.js";
import {
 claimAgentAssignment,
 listGoalAssignments,
 deleteGoalAssignments
} from "../dist/team/team-assignment.repository.js";
import {
 createWorkHandoff,
 reviseDraftWorkHandoff,
 deliverWorkHandoff,
 bindIncomingHandoffs,
 consumeIncomingHandoffs,
 incomingHandoffContext
} from "../dist/team/handoff.service.js";
import {
 getAgentHandoff,
 listGoalHandoffs,
 listIncomingWorkHandoffs,
 deleteGoalHandoffs
} from "../dist/team/handoff.repository.js";

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

const projectId=`prj_handoff_${Date.now()}`;
let goalId="";

function cleanup(){
 try{if(goalId)deleteGoalHandoffs(goalId);}catch{}
 try{if(goalId)deleteGoalAssignments(goalId);}catch{}
 try{if(goalId)deleteGoalTaskGraph(goalId);}catch{}
 try{if(goalId)deleteProjectGoal(goalId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
}

try{
 const time=new Date().toISOString();
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Handoff Regression",
  `handoff-${Date.now()}`,
  "queued",
  "queued",
  0,
  `workspaces/handoff-${Date.now()}`,
  time,
  time
 );

 const draft=createGoal({
  projectId,
  title:"Agent Handoff Test",
  objective:"Verify structured context moves between autonomous agents",
  priority:"high",
  requirements:[
   {text:"Design service architecture",required:true},
   {text:"Implement service",required:true}
  ],
  acceptanceCriteria:["Service validation passes"],
  constraints:[]
 });

 goalId=draft.id;
 const goal=prepareGoal(goalId);
 const r1=goal.requirements[0].id;
 const r2=goal.requirements[1].id;
 const a1=goal.acceptanceCriteria[0].id;

 createGoalTaskGraph(goalId,{
  items:[
   {
    key:"architecture",
    title:"Architecture",
    description:"Design service architecture",
    kind:"architecture",
    priority:90,
    dependencies:[],
    requirementIds:[r1],
    acceptanceCriterionIds:[]
   },
   {
    key:"implementation",
    title:"Implementation",
    description:"Implement service",
    kind:"implementation",
    priority:80,
    dependencies:["architecture"],
    requirementIds:[r2],
    acceptanceCriterionIds:[]
   },
   {
    key:"validation",
    title:"Validation",
    description:"Validate service",
    kind:"test",
    priority:70,
    dependencies:["implementation"],
    requirementIds:[r1,r2],
    acceptanceCriterionIds:[a1]
   }
  ]
 });

 refreshGoalTaskReadiness(goalId);
 let graph=loadGoalTaskGraph(goalId);
 const architecture=graph.items.find(x=>x.key==="architecture");
 const implementation=graph.items.find(x=>x.key==="implementation");
 const validation=graph.items.find(x=>x.key==="validation");

 const architectureAssignment=assignRunnableGoalTeam(goalId)[0];
 claimAgentAssignment(architectureAssignment.id,"architect-worker");

 const handoff=createWorkHandoff({
  goalId,
  fromAssignmentId:architectureAssignment.id,
  toWorkItemId:implementation.id,
  summary:"Use a service/repository boundary with persistent storage.",
  decisions:[
   "Use service/repository separation",
   "Keep API transport outside persistence layer",
   "Use service/repository separation"
  ],
  artifacts:[
   {
    path:"src/architecture.md",
    type:"file",
    description:"Architecture decisions"
   }
  ],
  evidence:[
   {
    type:"decision",
    summary:"Repository boundary selected",
    reference:"src/architecture.md"
   }
  ],
  risks:["Database migration compatibility"],
  recommendations:["Implement repository contract first"],
  metadata:{architectureVersion:1}
 });

 check("handoff created draft",handoff.status==="draft");
 check("handoff source assignment persisted",handoff.fromAssignmentId===architectureAssignment.id);
 check("handoff source work persisted",handoff.fromWorkItemId===architecture.id);
 check("handoff target work persisted",handoff.toWorkItemId===implementation.id);
 check("handoff initially unbound to future assignment",handoff.toAssignmentId===null);
 check("duplicate decisions normalized",handoff.decisions.length===2);
 check("artifact persisted",handoff.artifacts[0]?.path==="src/architecture.md");
 check("evidence persisted",handoff.evidence[0]?.type==="decision");
 check("risk persisted",handoff.risks.includes("Database migration compatibility"));
 check("recommendation persisted",handoff.recommendations.includes("Implement repository contract first"));
 check("metadata persisted",handoff.metadata.architectureVersion===1);

 const revised=reviseDraftWorkHandoff(handoff.id,{
  recommendations:[
   "Implement repository contract first",
   "Preserve existing public API"
  ]
 });
 check("draft handoff editable",revised.recommendations.length===2);

 const delivered=deliverWorkHandoff(handoff.id);
 check("handoff delivered",delivered.status==="delivered");
 check("delivery timestamp persisted",Boolean(delivered.deliveredAt));

 const deliveredAgain=deliverWorkHandoff(handoff.id);
 check("delivery idempotent",deliveredAgain.id===delivered.id);

 expectThrow("delivered handoff immutable",()=>{
  reviseDraftWorkHandoff(handoff.id,{summary:"Changed after delivery"});
 });

 expectThrow("handoff cannot target unrelated dependency",()=>{
  createWorkHandoff({
   goalId,
   fromAssignmentId:architectureAssignment.id,
   toWorkItemId:validation.id,
   summary:"Invalid direct handoff"
  });
 });

 updateGoalWorkStatus(architecture.id,"completed");
 refreshGoalTaskReadiness(goalId);

 graph=loadGoalTaskGraph(goalId);
 check("implementation unlocked",graph.items.find(x=>x.key==="implementation")?.status==="ready");

 const assignments=assignRunnableGoalTeam(goalId);
 const implementationAssignment=assignments.find(x=>x.workItemId===implementation.id);
 check("developer assignment created",Boolean(implementationAssignment));
 check("developer role assigned",implementationAssignment?.role==="developer");

 const bound=bindIncomingHandoffs(implementation.id,implementationAssignment.id);
 check("incoming handoff bound",bound.length===1);
 check("handoff bound to developer",bound[0]?.toAssignmentId===implementationAssignment.id);

 const context=incomingHandoffContext(implementation.id);
 check("handoff context available",context.length===1);
 check("summary available to next agent",context[0]?.summary.includes("service/repository"));
 check("decision available to next agent",context[0]?.decisions.includes("Use service/repository separation"));
 check("artifact available to next agent",context[0]?.artifacts[0]?.path==="src/architecture.md");
 check("risk available to next agent",context[0]?.risks[0]==="Database migration compatibility");
 check("recommendation available to next agent",context[0]?.recommendations.includes("Preserve existing public API"));

 claimAgentAssignment(implementationAssignment.id,"developer-worker");
 const consumed=consumeIncomingHandoffs(
  implementation.id,
  implementationAssignment.id
 );
 check("incoming handoff consumed",consumed[0]?.status==="consumed");
 check("consumption timestamp persisted",Boolean(consumed[0]?.consumedAt));

 const consumedAgain=consumeIncomingHandoffs(
  implementation.id,
  implementationAssignment.id
 );
 check("consumption idempotent",consumedAgain[0]?.id===handoff.id);

 expectThrow("consumed handoff cannot be revised",()=>{
  reviseDraftWorkHandoff(handoff.id,{summary:"Illegal edit"});
 });

 const persisted=getAgentHandoff(handoff.id);
 check("handoff survives reload",persisted?.status==="consumed");
 check("handoff retains bound assignment",persisted?.toAssignmentId===implementationAssignment.id);

 check("one goal handoff persisted",listGoalHandoffs(goalId).length===1);
 check("incoming history remains queryable",listIncomingWorkHandoffs(implementation.id).length===1);
 check("assignment history preserved",listGoalAssignments(goalId).length===2);

 const removed=deleteGoalHandoffs(goalId);
 check("handoff cleanup removes record",removed===1);
 check("handoff cleanup persisted",listGoalHandoffs(goalId).length===0);

 deleteGoalAssignments(goalId);
 deleteGoalTaskGraph(goalId);
 deleteProjectGoal(goalId);
 db.prepare("DELETE FROM projects WHERE id=?").run(projectId);

 check(
  "project cleanup",
  Number(db.prepare("SELECT COUNT(*) AS count FROM projects WHERE id=?").get(projectId)?.count)===0
 );
}catch(error){
 failed++;
 console.error(error);
 cleanup();
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 2 PASS 2");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 2 PASS 2 PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 2 PASS 2 FAILED");
 process.exitCode=1;
}
