import {
 activateGoal,
 addAcceptanceCriterion,
 addConstraint,
 addRequirement,
 completeGoal,
 createGoal,
 markAcceptanceCriterion,
 markRequirement,
 prepareGoal,
 validateGoal
} from "../dist/goals/goal.service.js";
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

const projectId=`prj_goal_regression_${Date.now()}`;

try{
 const goal=createGoal({
  projectId,
  title:"  Build autonomous calculator API  ",
  objective:" Build   and validate a calculator API autonomously. ",
  priority:"high",
  requirements:[
   {text:"Create HTTP API"},
   {text:"Create HTTP API"},
   {text:"Implement addition and subtraction"}
  ],
  acceptanceCriteria:[
   "Build succeeds",
   "Tests pass",
   "Tests pass"
  ],
  constraints:[
   {type:"security",text:" Do not expose credentials "}
  ]
 });

 check("goal created",Boolean(goal.id));
 check("goal begins draft",goal.status==="draft");
 check("input normalized",goal.title==="Build autonomous calculator API");
 check("duplicate requirements removed",goal.requirements.length===2);
 check("duplicate acceptance criteria removed",goal.acceptanceCriteria.length===2);
 check("constraint normalized",goal.constraints[0]?.text==="Do not expose credentials");

 const validation=validateGoal(goal);
 check("valid goal recognized",validation.valid);

 const ready=prepareGoal(goal.id);
 check("goal becomes ready",ready.status==="ready");

 const active=activateGoal(goal.id);
 check("goal becomes active",active.status==="active");
 check("activation timestamp recorded",Boolean(active.activatedAt));

 const withRequirement=addRequirement(goal.id,"Provide health endpoint");
 check("requirement can be added",withRequirement.requirements.length===3);

 const withCriterion=addAcceptanceCriterion(goal.id,"Health endpoint returns 200");
 check("criterion can be added",withCriterion.acceptanceCriteria.length===3);

 const withConstraint=addConstraint(goal.id,"technical","Use TypeScript");
 check("constraint can be added",withConstraint.constraints.length===2);

 let current=getProjectGoal(goal.id);
 for(const requirement of current.requirements){
  current=markRequirement(goal.id,requirement.id,"satisfied");
 }
 for(const criterion of current.acceptanceCriteria){
  current=markAcceptanceCriterion(goal.id,criterion.id,"passed","Regression evidence");
 }

 check("all requirements satisfied",current.requirements.every(x=>x.status==="satisfied"));
 check("all criteria passed",current.acceptanceCriteria.every(x=>x.status==="passed"));
 check("criterion evidence persisted",current.acceptanceCriteria.every(x=>x.evidence==="Regression evidence"));

 const completed=completeGoal(goal.id);
 check("goal completes",completed.status==="completed");
 check("completion timestamp recorded",Boolean(completed.completedAt));

 check("goal persisted",Boolean(getProjectGoal(goal.id)));
 check("goal cleanup",deleteProjectGoal(goal.id));
}catch(error){
 failed++;
 console.error(error);
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 1 PASS 1");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 1 PASS 1 PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 1 PASS 1 FAILED");
 process.exitCode=1;
}
