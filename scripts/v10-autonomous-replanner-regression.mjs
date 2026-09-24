import assert from"node:assert/strict";
import{randomBytes}from"node:crypto";
import{db}from"../dist/database/database.js";
import{
 normalizeAIContinuationPlan,
 validateAIContinuationPlan,
 proposeDevelopmentContinuation,
 autonomouslyContinueDevelopment
}from"../dist/development/autonomous-replanner.service.js";
import{ensureDevelopmentCycle}from"../dist/development/development-cycle.service.js";
import{deleteDevelopmentCycles,listDevelopmentCycles}from"../dist/development/development-cycle.repository.js";
import{completeGoalTaskExecution}from"../dist/team/goal-team-execution.service.js";

let passed=0,failed=0;
function check(name,fn){
 try{assert.ok(fn());passed++;console.log(`PASS ${name}`);}
 catch(error){failed++;console.log(`FAIL ${name}`);console.log(error.message);}
}
async function rejects(name,fn,pattern){
 try{
  await fn();
  failed++;
  console.log(`FAIL ${name}`);
  console.log("Expected rejection.");
 }catch(error){
  try{
   assert.match(String(error?.message??error),pattern);
   passed++;
   console.log(`PASS ${name}`);
  }catch(assertion){
   failed++;
   console.log(`FAIL ${name}`);
   console.log(assertion.message);
  }
 }
}

const suffix=Date.now().toString(36)+randomBytes(3).toString("hex");
const projectId=`prj_b3p35_${suffix}`;
const goalId=`goal_b3p35_${suffix}`;
const sessionId=`ses_b3p35_${suffix}`;
const coreId=`wrk_core_${suffix}`;
const now=new Date().toISOString();
let captured=null;
let calls=0;

const fakeProvider={
 name:"fake-replanner",
 model:"fake-v1",
 configured:true,
 local:true,
 endpoint:null,
 async health(){
  return{name:this.name,model:this.model,configured:true,local:true,endpoint:null};
 },
 async json(system,prompt,taskId,receivedProjectId){
  calls++;
  captured={system,prompt,taskId,projectId:receivedProjectId};
  return{
   reason:"Uncovered requirement and acceptance criterion require follow-up work.",
   work:[
    {
     key:"Extra Impl",
     title:"Implement follow-up capability",
     description:"Implement the uncovered requirement.",
     kind:"implementation",
     priority:70,
     dependencies:["core"],
     requirementIds:["req_extra"]
    },
    {
     key:"Extra Test",
     title:"Validate follow-up capability",
     description:"Verify the uncovered acceptance criterion.",
     kind:"test",
     priority:60,
     dependencies:["extra-impl"],
     acceptanceIds:["acc_extra"]
    }
   ]
  };
 }
};

function graph(){
 return db.prepare("SELECT * FROM goal_work_items WHERE goal_id=? ORDER BY created_at,id").all(goalId);
}
function dispatch(key){
 return db.prepare(`
  SELECT d.* FROM goal_work_dispatches d
  JOIN goal_work_items w ON w.id=d.work_item_id
  WHERE d.goal_id=? AND w.work_key=?
 `).get(goalId,key);
}

try{
 const normalized=normalizeAIContinuationPlan({
  reason:"  Continue safely  ",
  work:[
   {
    key:" Feature One ",
    title:" Feature ",
    description:" Implement it ",
    kind:"implementation",
    priority:150,
    dependencies:["core","core",""],
    requirementIds:["req_extra","req_extra"]
   },
   {
    key:"feature one",
    title:"duplicate",
    description:"duplicate",
    kind:"invalid"
   }
  ]
 });
 check("AI plan reason normalized",()=>normalized.reason==="Continue safely");
 check("AI key normalized",()=>normalized.work[0].key==="feature-one");
 check("duplicate normalized key removed",()=>normalized.work.length===1);
 check("priority clamped",()=>normalized.work[0].priority===100);
 check("dependency list deduplicated",()=>normalized.work[0].dependencies.length===1);
 check("coverage list deduplicated",()=>normalized.work[0].requirementIds.length===1);
 check("valid normalized plan accepted",()=>validateAIContinuationPlan(normalized).valid);
 check("empty AI plan rejected by structural validator",()=>!validateAIContinuationPlan({reason:"none",work:[]}).valid);

 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,progress,workspace,created_at,updated_at,phase
  )VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,"Batch 3 Pass 3.5",`b3p35-${suffix}`,"active",50,
  `workspaces/b3p35-${suffix}`,now,now,"autonomous_development"
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,priority,requirements_json,
   acceptance_criteria_json,constraints_json,source_task_id,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  goalId,projectId,"Autonomous replanning",
  "Allow Veylith to determine safe follow-up work after a development cycle.",
  "active",0,
  JSON.stringify([
   {id:"req_core",text:"Core capability",required:true},
   {id:"req_extra",text:"Follow-up capability",required:true}
  ]),
  JSON.stringify([
   {id:"acc_extra",text:"Follow-up capability is validated"}
  ]),
  JSON.stringify([{type:"technical",text:"Preserve existing completed work"}]),
  null,now,now
 );

 db.prepare(`
  INSERT INTO goal_work_items(
   id,goal_id,project_id,work_key,title,description,kind,status,priority,
   dependencies_json,requirement_ids_json,acceptance_ids_json,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  coreId,goalId,projectId,"core","Core capability","Existing completed core work",
  "implementation","completed",50,"[]",'["req_core"]',"[]",now,now
 );

 db.prepare(`
  INSERT INTO development_sessions(
   id,project_id,goal_id,status,progress,current_milestone_id,recovery_count,
   pause_reason,created_at,updated_at,started_at,completed_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  sessionId,projectId,goalId,"active",50,null,0,null,now,now,now,null
 );

 ensureDevelopmentCycle(sessionId);

 const proposed=await proposeDevelopmentContinuation(
  sessionId,
  {provider:fakeProvider,taskId:"fake-replan-task"}
 );

 check("fake provider called once for proposal",()=>calls===1);
 check("provider receives project id",()=>captured.projectId===projectId);
 check("provider receives supplied task id",()=>captured.taskId==="fake-replan-task");
 check("system prompt forbids direct source generation",()=>captured.system.includes("Do not generate source code"));
 check("prompt contains project goal",()=>captured.prompt.includes("PROJECT GOAL:"));
 check("prompt contains current development graph",()=>captured.prompt.includes("CURRENT DEVELOPMENT GRAPH:"));
 check("prompt contains continuation evaluation",()=>captured.prompt.includes("CONTINUATION EVALUATION:"));
 check("prompt contains uncovered requirement id",()=>captured.prompt.includes("req_extra"));
 check("prompt contains uncovered acceptance id",()=>captured.prompt.includes("acc_extra"));
 check("AI proposal returns two items",()=>proposed.work.length===2);
 check("AI proposal keys normalized",()=>proposed.work[0].key==="extra-impl"&&proposed.work[1].key==="extra-test");
 check("AI proposal preserves dependency relationship",()=>proposed.work[1].dependencies.includes("extra-impl"));

 const callsBeforeApply=calls;
 const autonomous=await autonomouslyContinueDevelopment(
  sessionId,
  {provider:fakeProvider,taskId:"fake-autonomous-replan"}
 );

 check("autonomous replanner called AI",()=>calls===callsBeforeApply+1);
 check("autonomous continuation applied",()=>autonomous.applied===true);
 check("autonomous result contains plan",()=>autonomous.plan?.work.length===2);
 check("autonomous result contains deterministic continuation",()=>Boolean(autonomous.continuation));

 const rows=graph();
 const impl=rows.find(row=>row.work_key==="extra-impl");
 const test=rows.find(row=>row.work_key==="extra-test");

 check("AI proposed implementation persisted through safe expansion",()=>Boolean(impl));
 check("AI proposed validation persisted through safe expansion",()=>Boolean(test));
 check("existing core preserved",()=>rows.find(row=>row.work_key==="core")?.status==="completed");
 check("implementation requirement coverage persisted",()=>JSON.parse(impl.requirement_ids_json).includes("req_extra"));
 check("validation acceptance coverage persisted",()=>JSON.parse(test.acceptance_ids_json).includes("acc_extra"));
 check("implementation dependency persisted",()=>JSON.parse(impl.dependencies_json).includes("core"));
 check("validation dependency persisted",()=>JSON.parse(test.dependencies_json).includes("extra-impl"));

 const implDispatch=dispatch("extra-impl");
 check("AI proposed implementation enters normal dispatch",()=>Boolean(implDispatch?.task_id));
 check("AI proposed validation waits for dependency",()=>!dispatch("extra-test"));
 check("new development cycle created",()=>listDevelopmentCycles(sessionId).length===2);

 completeGoalTaskExecution(implDispatch.task_id);
 const testDispatch=dispatch("extra-test");
 check("validation automatically dispatches after implementation",()=>Boolean(testDispatch?.task_id));

 completeGoalTaskExecution(testDispatch.task_id);

 const completed=await autonomouslyContinueDevelopment(
  sessionId,
  {provider:fakeProvider,taskId:"should-not-call-ai"}
 );
 check("completed goal does not call AI again",()=>calls===callsBeforeApply+1);
 check("completed goal does not apply another continuation",()=>completed.applied===false);
 check("completed goal returns no plan",()=>completed.plan===null);

 const invalidProvider={
  ...fakeProvider,
  async json(){
   return{
    reason:"unsafe proposal",
    work:[{
     key:"bad-work",
     title:"Bad work",
     description:"References nonexistent goal coverage.",
     kind:"implementation",
     dependencies:["missing-dependency"],
     requirementIds:["not-a-real-requirement"]
    }]
   };
  }
 };

 const beforeInvalidCount=graph().length;
 await rejects(
  "deterministic expansion rejects unsafe AI proposal",
  ()=>proposeDevelopmentContinuation(sessionId,{provider:invalidProvider}),
  /already satisfied/
 );
 check("completed graph unchanged after rejected replanning attempt",()=>graph().length===beforeInvalidCount);

 const emptyProvider={
  ...fakeProvider,
  async json(){return{reason:"nothing",work:[]};}
 };

 db.prepare("UPDATE goal_work_items SET status='ready' WHERE id=?").run(test.id);
 await rejects(
  "empty AI continuation plan rejected",
  ()=>proposeDevelopmentContinuation(sessionId,{provider:emptyProvider}),
  /contains no work/
 );
 db.prepare("UPDATE goal_work_items SET status='completed' WHERE id=?").run(test.id);

 const unsafeSessionId=`ses_b3p35unsafe_${suffix}`;
 db.prepare(`
  INSERT INTO development_sessions(
   id,project_id,goal_id,status,progress,current_milestone_id,recovery_count,
   pause_reason,created_at,updated_at,started_at,completed_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  unsafeSessionId,projectId,goalId,"active",50,null,0,null,now,now,now,null
 );
 ensureDevelopmentCycle(unsafeSessionId);
 db.prepare("UPDATE goal_work_items SET status='ready' WHERE id=?").run(test.id);

 const badReferenceProvider={
  ...fakeProvider,
  async json(){
   return{
    reason:"bad references",
    work:[{
     key:"unsafe-extra",
     title:"Unsafe extra",
     description:"Invalid references must not mutate graph.",
     kind:"implementation",
     dependencies:["does-not-exist"],
     requirementIds:["fake-requirement"]
    }]
   };
  }
 };

 const graphBeforeUnsafe=graph().length;
 await rejects(
  "unsafe AI references rejected by deterministic DAG authority",
  ()=>autonomouslyContinueDevelopment(
   unsafeSessionId,
   {provider:badReferenceProvider,taskId:"unsafe-reference-test"}
  ),
  /unknown dependency|unknown requirement/i
 );
 check("unsafe AI proposal creates no graph mutation",()=>graph().length===graphBeforeUnsafe);
 db.prepare("UPDATE goal_work_items SET status='completed' WHERE id=?").run(test.id);
 db.prepare("DELETE FROM development_sessions WHERE id=?").run(unsafeSessionId);
}finally{
 try{
  const taskRows=db.prepare("SELECT id FROM tasks WHERE project_id=?").all(projectId);
  for(const row of taskRows){
   try{db.prepare("DELETE FROM jobs WHERE task_id=?").run(row.id);}catch{}
  }
 }catch{}
 try{db.prepare("DELETE FROM goal_work_dispatches WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM agent_handoffs WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM agent_assignments WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM goal_role_results WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM team_recoveries WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM tasks WHERE project_id=?").run(projectId);}catch{}
 try{deleteDevelopmentCycles(sessionId);}catch{}
 try{db.prepare("DELETE FROM development_milestones WHERE session_id=?").run(sessionId);}catch{}
 try{db.prepare("DELETE FROM development_sessions WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 3 PASS 3.5");
console.log(" AI AUTONOMOUS REPLANNER");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 3.5 PASSED");
}else{
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 3.5 NOT YET CLOSED");
 process.exitCode=1;
}

