import assert from"node:assert/strict";
import{randomBytes}from"node:crypto";
import{db}from"../dist/database/database.js";
import{
 expandGoalWorkGraph,
 validateGoalExpansion
}from"../dist/development/goal-expansion.service.js";
import{
 deleteDevelopmentCycles,
 listDevelopmentCycles
}from"../dist/development/development-cycle.repository.js";
import{ensureDevelopmentCycle}from"../dist/development/development-cycle.service.js";

let passed=0,failed=0;
function check(name,fn){
 try{assert.ok(fn());passed++;console.log(`PASS ${name}`);}
 catch(error){failed++;console.log(`FAIL ${name}`);console.log(error.message);}
}
function rejects(name,fn,contains){
 try{
  fn();
  failed++;
  console.log(`FAIL ${name}`);
  console.log("Expected rejection.");
 }catch(error){
  try{
   assert.ok(String(error.message).includes(contains));
   passed++;
   console.log(`PASS ${name}`);
  }catch(inner){
   failed++;
   console.log(`FAIL ${name}`);
   console.log(inner.message);
  }
 }
}

const suffix=Date.now().toString(36)+randomBytes(3).toString("hex");
const projectId=`prj_b3p33_${suffix}`;
const goalId=`goal_b3p33_${suffix}`;
const sessionId=`ses_b3p33_${suffix}`;
const baseWork=`wrk_base_${suffix}`;
const now=new Date().toISOString();

function work(){
 return db.prepare(`
  SELECT * FROM goal_work_items WHERE goal_id=? ORDER BY created_at,id
 `).all(goalId);
}

try{
 db.prepare(`
  INSERT INTO projects(id,name,slug,status,progress,workspace,created_at,updated_at,phase)
  VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,"Batch 3 Pass 3.3",`b3p33-${suffix}`,"active",50,
  `workspaces/b3p33-${suffix}`,now,now,"autonomous_development"
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,priority,requirements_json,
   acceptance_criteria_json,constraints_json,source_task_id,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  goalId,projectId,"Safe DAG expansion","Expand goal graph safely","active",0,
  JSON.stringify([
   {id:"req_core",text:"Core implementation"},
   {id:"req_extra",text:"Follow-up implementation"}
  ]),
  JSON.stringify([{id:"acc_extra",text:"Follow-up behavior validated"}]),
  "[]",null,now,now
 );

 db.prepare(`
  INSERT INTO goal_work_items(
   id,goal_id,project_id,work_key,title,description,kind,status,priority,
   dependencies_json,requirement_ids_json,acceptance_ids_json,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  baseWork,goalId,projectId,"core","Core","Existing completed core",
  "implementation","completed",0,"[]",'["req_core"]',"[]",now,now
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

 const valid=[
  {
   key:"extra_impl",
   title:"Follow-up implementation",
   description:"Implement uncovered requirement.",
   kind:"implementation",
   dependencies:["core"],
   requirementIds:["req_extra"]
  },
  {
   key:"extra_test",
   title:"Follow-up validation",
   description:"Validate follow-up implementation.",
   kind:"test",
   dependencies:["extra_impl"],
   acceptanceIds:["acc_extra"]
  }
 ];

 check("valid continuation expansion accepted",()=>{
  validateGoalExpansion(goalId,valid);
  return true;
 });

 rejects(
  "duplicate existing key rejected",
  ()=>validateGoalExpansion(goalId,[{...valid[0],key:"core"}]),
  "already exists"
 );

 rejects(
  "duplicate proposed key rejected",
  ()=>validateGoalExpansion(goalId,[valid[0],{...valid[0]}]),
  "Duplicate"
 );

 rejects(
  "unknown dependency rejected",
  ()=>validateGoalExpansion(goalId,[{...valid[0],dependencies:["missing"]}]),
  "unknown dependency"
 );

 rejects(
  "self dependency rejected",
  ()=>validateGoalExpansion(goalId,[{...valid[0],key:"self",dependencies:["self"]}]),
  "cannot depend on itself"
 );

 rejects(
  "unknown requirement rejected",
  ()=>validateGoalExpansion(goalId,[{...valid[0],requirementIds:["req_missing"]}]),
  "unknown requirement"
 );

 rejects(
  "unknown acceptance rejected",
  ()=>validateGoalExpansion(goalId,[{...valid[1],dependencies:["core"],acceptanceIds:["acc_missing"]}]),
  "unknown acceptance"
 );

 rejects(
  "dependency cycle rejected",
  ()=>validateGoalExpansion(goalId,[
   {...valid[0],key:"cycle_a",dependencies:["cycle_b"]},
   {...valid[1],key:"cycle_b",dependencies:["cycle_a"]}
  ]),
  "dependency cycle"
 );

 const before=work().length;
 const result=expandGoalWorkGraph(goalId,valid);

 check("two follow-up work items added",()=>result.addedWorkItemIds.length===2);
 check("follow-up keys returned",()=>result.addedWorkKeys.includes("extra_impl")&&result.addedWorkKeys.includes("extra_test"));
 check("graph size increased atomically",()=>result.totalWorkItems===before+2);

 const rows=work();
 const impl=rows.find(row=>row.work_key==="extra_impl");
 const test=rows.find(row=>row.work_key==="extra_test");

 check("follow-up implementation persisted",()=>Boolean(impl));
 check("follow-up validation persisted",()=>Boolean(test));
 check("implementation dependency persisted",()=>JSON.parse(impl.dependencies_json).includes("core"));
 check("validation dependency persisted",()=>JSON.parse(test.dependencies_json).includes("extra_impl"));
 check("requirement coverage persisted",()=>JSON.parse(impl.requirement_ids_json).includes("req_extra"));
 check("acceptance coverage persisted",()=>JSON.parse(test.acceptance_ids_json).includes("acc_extra"));
 check("completed dependency makes implementation ready",()=>impl.status==="ready");
 check("unfinished proposed dependency blocks validation",()=>test.status==="blocked");

 const countAfter=work().length;
 rejects(
  "re-expansion cannot duplicate work",
  ()=>expandGoalWorkGraph(goalId,valid),
  "already exists"
 );
 check("rejected re-expansion leaves graph unchanged",()=>work().length===countAfter);

 const countBeforeInvalid=work().length;
 rejects(
  "invalid expansion does not partially persist",
  ()=>expandGoalWorkGraph(goalId,[
   {
    key:"atomic_a",
    title:"Atomic A",
    description:"Atomic A",
    kind:"implementation",
    dependencies:["core"]
   },
   {
    key:"atomic_b",
    title:"Atomic B",
    description:"Atomic B",
    kind:"test",
    dependencies:["does_not_exist"]
   }
  ]),
  "unknown dependency"
 );
 check("invalid expansion rollback verified",()=>work().length===countBeforeInvalid);

 check("existing completed work preserved",()=>{
  const row=work().find(item=>item.work_key==="core");
  return row?.status==="completed"&&row?.id===baseWork;
 });

 check("original cycle preserved",()=>listDevelopmentCycles(sessionId).length===1);

 deleteDevelopmentCycles(sessionId);
 check("cycle cleanup succeeds",()=>listDevelopmentCycles(sessionId).length===0);
}finally{
 try{deleteDevelopmentCycles(sessionId);}catch{}
 try{db.prepare("DELETE FROM goal_work_dispatches WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM agent_handoffs WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM agent_assignments WHERE goal_id=?").run(goalId);}catch{}
 try{
  const taskIds=db.prepare("SELECT id FROM tasks WHERE project_id=?").all(projectId).map(x=>x.id);
  for(const taskId of taskIds){
   try{db.prepare("DELETE FROM jobs WHERE task_id=?").run(taskId);}catch{}
  }
  db.prepare("DELETE FROM tasks WHERE project_id=?").run(projectId);
 }catch{}
 try{db.prepare("DELETE FROM development_sessions WHERE id=?").run(sessionId);}catch{}
 try{db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 3 PASS 3.3");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
if(failed===0)console.log("\nVEYLITH v1.0 BATCH 3 PASS 3.3 PASSED");
else{
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 3.3 NOT YET CLOSED");
 process.exitCode=1;
}

