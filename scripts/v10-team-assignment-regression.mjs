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
 teamRoles,
 roleForWorkKind
} from "../dist/team/team-role.service.js";
import {
 assignRunnableGoalTeam,
 assignGoalWork,
 synchronizeGoalTeam
} from "../dist/team/team-assignment.service.js";
import {
 getActiveWorkAssignment,
 claimAgentAssignment,
 releaseAgentAssignment,
 setAgentAssignmentStatus,
 listGoalAssignments,
 deleteGoalAssignments
} from "../dist/team/team-assignment.repository.js";

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

const projectId=`prj_team_${Date.now()}`;
let goalId="";

function cleanup(){
 try{if(goalId)deleteGoalAssignments(goalId);}catch{}
 try{if(goalId)deleteGoalTaskGraph(goalId);}catch{}
 try{if(goalId)deleteProjectGoal(goalId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
}

try{
 const roles=teamRoles();
 check("nine team roles registered",roles.length===9);
 check("architect role registered",roles.some(x=>x.role==="architect"));
 check("planner role registered",roles.some(x=>x.role==="planner"));
 check("developer role registered",roles.some(x=>x.role==="developer"));
 check("tester role registered",roles.some(x=>x.role==="tester"));
 check("reviewer role registered",roles.some(x=>x.role==="reviewer"));
 check("diagnostic role registered",roles.some(x=>x.role==="diagnostic"));
 check("repair role registered",roles.some(x=>x.role==="repair"));
 check("documentation role registered",roles.some(x=>x.role==="documentation"));
 check("delivery role registered",roles.some(x=>x.role==="delivery"));

 check("architecture maps architect",roleForWorkKind("architecture")==="architect");
 check("analysis maps planner",roleForWorkKind("analysis")==="planner");
 check("implementation maps developer",roleForWorkKind("implementation")==="developer");
 check("integration maps developer",roleForWorkKind("integration")==="developer");
 check("test maps tester",roleForWorkKind("test")==="tester");
 check("documentation maps documentation",roleForWorkKind("documentation")==="documentation");
 check("delivery maps delivery",roleForWorkKind("delivery")==="delivery");
 check("unknown maps developer",roleForWorkKind("unknown")==="developer");

 const time=new Date().toISOString();
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Team Assignment Regression",
  `team-assignment-${Date.now()}`,
  "queued",
  "queued",
  0,
  `workspaces/team-assignment-${Date.now()}`,
  time,
  time
 );

 const draft=createGoal({
  projectId,
  title:"Team Assignment Test",
  objective:"Verify persistent autonomous team ownership",
  priority:"high",
  requirements:[
   {text:"Design architecture",required:true},
   {text:"Implement API",required:true}
  ],
  acceptanceCriteria:[
   "Implementation validation passes"
  ],
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
    description:"Design architecture",
    kind:"architecture",
    priority:90,
    dependencies:[],
    requirementIds:[r1],
    acceptanceCriterionIds:[]
   },
   {
    key:"implementation",
    title:"Implementation",
    description:"Implement API",
    kind:"implementation",
    priority:80,
    dependencies:["architecture"],
    requirementIds:[r2],
    acceptanceCriterionIds:[]
   },
   {
    key:"validation",
    title:"Validation",
    description:"Validate implementation",
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

 check("architecture initially ready",architecture?.status==="ready");
 check("implementation initially pending",implementation?.status==="pending");
 check("validation initially pending",validation?.status==="pending");

 const first=assignRunnableGoalTeam(goalId);
 check("only ready work assigned",first.length===1);
 check("architecture assigned architect",first[0]?.role==="architect");
 check("assignment initially assigned",first[0]?.status==="assigned");

 const duplicate=assignRunnableGoalTeam(goalId);
 check("assignment idempotent",duplicate.length===1&&duplicate[0].id===first[0].id);
 check("single active assignment",getActiveWorkAssignment(architecture.id)?.id===first[0].id);

 expectThrow("pending implementation cannot be assigned",()=>{
  assignGoalWork(implementation.id,goalId);
 });

 const claimed=claimAgentAssignment(first[0].id,"worker-alpha");
 check("assignment claimed",claimed.status==="working");
 check("owner persisted",claimed.ownerToken==="worker-alpha");
 check("started timestamp persisted",Boolean(claimed.startedAt));

 const sameClaim=claimAgentAssignment(first[0].id,"worker-alpha");
 check("same owner claim idempotent",sameClaim.id===claimed.id);

 expectThrow("second owner cannot claim",()=>{
  claimAgentAssignment(first[0].id,"worker-beta");
 });

 expectThrow("wrong owner cannot release",()=>{
  releaseAgentAssignment(first[0].id,"worker-beta");
 });

 const released=releaseAgentAssignment(first[0].id,"worker-alpha");
 check("release returns assigned",released.status==="assigned");
 check("release clears owner",released.ownerToken===null);

 const reclaimed=claimAgentAssignment(first[0].id,"worker-beta");
 check("released assignment reclaimable",reclaimed.ownerToken==="worker-beta");

 updateGoalWorkStatus(architecture.id,"completed");
 synchronizeGoalTeam(goalId);

 let assignments=listGoalAssignments(goalId);
 const architectureAssignment=assignments.find(x=>x.id===first[0].id);
 check("completed work completes assignment",architectureAssignment?.status==="completed");
 check("assignment completion timestamp persisted",Boolean(architectureAssignment?.completedAt));

 expectThrow("terminal assignment cannot be reclaimed",()=>{
  claimAgentAssignment(first[0].id,"worker-gamma");
 });

 refreshGoalTaskReadiness(goalId);
 graph=loadGoalTaskGraph(goalId);
 check("implementation unlocks",graph.items.find(x=>x.key==="implementation")?.status==="ready");

 const second=assignRunnableGoalTeam(goalId);
 const developerAssignment=second.find(x=>x.workItemId===implementation.id);
 check("implementation receives assignment",Boolean(developerAssignment));
 check("implementation assigned developer",developerAssignment?.role==="developer");

 claimAgentAssignment(developerAssignment.id,"worker-dev");
 updateGoalWorkStatus(implementation.id,"failed");
 synchronizeGoalTeam(goalId);

 assignments=listGoalAssignments(goalId);
 check(
  "failed work fails assignment",
  assignments.find(x=>x.id===developerAssignment.id)?.status==="failed"
 );

 refreshGoalTaskReadiness(goalId);
 graph=loadGoalTaskGraph(goalId);
 check("dependent validation becomes blocked",graph.items.find(x=>x.key==="validation")?.status==="blocked");

 const afterFailure=assignRunnableGoalTeam(goalId);
 check("blocked work receives no assignment",!afterFailure.some(x=>x.workItemId===validation.id));

 check("two assignments persisted",listGoalAssignments(goalId).length===2);
 check("assignment history survives reload",listGoalAssignments(goalId)[0].goalId===goalId);

 expectThrow("terminal status cannot change",()=>{
  setAgentAssignmentStatus(developerAssignment.id,"completed","worker-dev");
 });

 const removed=deleteGoalAssignments(goalId);
 check("assignment cleanup removes history",removed===2);
 check("assignment cleanup persisted",listGoalAssignments(goalId).length===0);

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
console.log(" VEYLITH v1.0 BATCH 2 PASS 1");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 2 PASS 1 PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 2 PASS 1 FAILED");
 process.exitCode=1;
}
