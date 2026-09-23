import {
 normalizeAIProjectIntake,
 persistProjectIntake,
 validateAIProjectIntake
} from "../dist/goals/project-intake.service.js";
import {deleteProjectGoal,getProjectGoal} from "../dist/goals/goal.repository.js";

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

const projectId=`prj_intake_regression_${Date.now()}`;
const created=[];

try{
 const raw={
  title:"  Task Management REST API  ",
  objective:" Build   a task management REST API with authentication. ",
  priority:"HIGH",
  requirements:[
   {text:"Create task CRUD endpoints",required:true},
   {text:"Create task CRUD endpoints",required:false},
   {text:"Implement user authentication",required:true},
   {text:"Validate API input",required:true}
  ],
  acceptanceCriteria:[
   "All automated tests pass",
   "Authentication protects private endpoints",
   "All automated tests pass"
  ],
  constraints:[
   {type:"security",text:" Never expose credentials "},
   {type:"technical",text:" Use TypeScript "}
  ],
  assumptions:["Existing repository conventions will be preserved"],
  clarificationNeeded:false,
  clarificationQuestions:[]
 };

 const normalized=normalizeAIProjectIntake(raw,"Build task API");
 check("title normalized",normalized.title==="Task Management REST API");
 check("objective normalized",normalized.objective==="Build a task management REST API with authentication.");
 check("priority normalized",normalized.priority==="high");
 check("duplicate requirements removed",normalized.requirements.length===3);
 check("required wins duplicate merge",normalized.requirements[0]?.required===true);
 check("duplicate criteria removed",normalized.acceptanceCriteria.length===2);
 check("constraints normalized",normalized.constraints.length===2);
 check("security constraint retained",normalized.constraints.some(x=>x.type==="security"));
 check("assumption retained",normalized.assumptions.length===1);
 check("no clarification required",normalized.clarificationNeeded===false);

 const validation=validateAIProjectIntake(normalized);
 check("valid AI intake accepted",validation.valid);

 const persisted=persistProjectIntake({
  projectId,
  request:"Build a task management REST API with authentication.",
  sourceTaskId:"tsk_intake_regression"
 },normalized);
 created.push(persisted.goal.id);

 check("goal persisted",Boolean(getProjectGoal(persisted.goal.id)));
 check("ready goal created automatically",persisted.goal.status==="ready");
 check("source task retained",persisted.goal.sourceTaskId==="tsk_intake_regression");
 check("requirements persisted",persisted.goal.requirements.length===3);
 check("criteria persisted",persisted.goal.acceptanceCriteria.length===2);
 check("constraints persisted",persisted.goal.constraints.length===2);

 const clarification=normalizeAIProjectIntake({
  title:"Ambiguous deployment",
  objective:"Deploy application to required private infrastructure",
  priority:"normal",
  requirements:[{text:"Deploy application",required:true}],
  acceptanceCriteria:["Application is reachable in target environment"],
  constraints:[],
  assumptions:[],
  clarificationNeeded:true,
  clarificationQuestions:["Which private deployment environment must be used?"]
 },"Deploy this to our private environment");

 const blocked=persistProjectIntake({
  projectId,
  request:"Deploy this to our private environment"
 },clarification);
 created.push(blocked.goal.id);

 check("clarification keeps goal draft",blocked.goal.status==="draft");
 check("clarification question retained",blocked.analysis.clarificationQuestions.length===1);

 const fallback=normalizeAIProjectIntake({
  title:"",
  objective:"",
  priority:"unexpected",
  requirements:[{text:"Build requested feature"}],
  acceptanceCriteria:["Feature works"],
  constraints:[{type:"unexpected",text:"Custom constraint"}]
 },"Build the requested feature");
 check("objective fallback uses request",fallback.objective==="Build the requested feature");
 check("unknown priority falls back normal",fallback.priority==="normal");
 check("unknown constraint becomes other",fallback.constraints[0]?.type==="other");

 const invalid=normalizeAIProjectIntake({
  title:"Invalid intake",
  objective:"Has no measurable definition",
  requirements:[],
  acceptanceCriteria:[]
 },"Invalid request");
 check("invalid intake detected",!validateAIProjectIntake(invalid).valid);

 expectThrow("invalid intake cannot persist",()=>persistProjectIntake({
  projectId,
  request:"Invalid request"
 },invalid));

 for(const goalId of created){
  check(`cleanup ${goalId}`,deleteProjectGoal(goalId));
 }
}catch(error){
 failed++;
 console.error(error);
 for(const goalId of created){
  try{deleteProjectGoal(goalId);}catch{}
 }
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 1 PASS 2");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 1 PASS 2 PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 1 PASS 2 FAILED");
 process.exitCode=1;
}
