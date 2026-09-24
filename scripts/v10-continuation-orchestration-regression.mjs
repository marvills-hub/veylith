import assert from"node:assert/strict";
import{randomBytes}from"node:crypto";
import{db}from"../dist/database/database.js";
import{applyDevelopmentContinuation}from"../dist/development/development-continuation.service.js";
import{
 deleteDevelopmentCycles,
 listDevelopmentCycles
}from"../dist/development/development-cycle.repository.js";
import{ensureDevelopmentCycle}from"../dist/development/development-cycle.service.js";
import{evaluateDevelopmentContinuation}from"../dist/development/continuation-evaluator.service.js";
import{
 completeGoalTaskExecution,
 goalExecutionForTask,
 goalExecutionSnapshot
}from"../dist/team/goal-team-execution.service.js";

let passed=0,failed=0;
function check(name,fn){
 try{assert.ok(fn());passed++;console.log(`PASS ${name}`);}
 catch(error){failed++;console.log(`FAIL ${name}`);console.log(error.message);}
}
const suffix=Date.now().toString(36)+randomBytes(3).toString("hex");
const projectId=`prj_b3p34_${suffix}`;
const goalId=`goal_b3p34_${suffix}`;
const sessionId=`ses_b3p34_${suffix}`;
const coreId=`wrk_core_${suffix}`;
const now=new Date().toISOString();

function graph(){
 return db.prepare(`
  SELECT * FROM goal_work_items
  WHERE goal_id=?
  ORDER BY created_at,id
 `).all(goalId);
}
function dispatch(key){
 return db.prepare(`
  SELECT d.*
  FROM goal_work_dispatches d
  JOIN goal_work_items w ON w.id=d.work_item_id
  WHERE d.goal_id=? AND w.work_key=?
 `).get(goalId,key);
}
function assignment(key){
 return db.prepare(`
  SELECT a.*
  FROM agent_assignments a
  JOIN goal_work_items w ON w.id=a.work_item_id
  WHERE a.goal_id=? AND w.work_key=?
  ORDER BY a.created_at DESC LIMIT 1
 `).get(goalId,key);
}
function task(taskId){
 return db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId);
}
function jobs(taskId){
 return db.prepare("SELECT * FROM jobs WHERE task_id=?").all(taskId);
}

try{
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,progress,workspace,created_at,updated_at,phase
  )VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,"Batch 3 Pass 3.4",`b3p34-${suffix}`,"active",50,
  `workspaces/b3p34-${suffix}`,now,now,"autonomous_development"
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,priority,requirements_json,
   acceptance_criteria_json,constraints_json,source_task_id,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  goalId,projectId,"Continuation orchestration",
  "Verify expanded work enters normal team and queue execution",
  "active",0,
  JSON.stringify([
   {id:"req_core",text:"Core implementation"},
   {id:"req_extra",text:"Follow-up implementation"}
  ]),
  JSON.stringify([
   {id:"acc_extra",text:"Follow-up behavior validated"}
  ]),
  "[]",null,now,now
 );

 db.prepare(`
  INSERT INTO goal_work_items(
   id,goal_id,project_id,work_key,title,description,kind,status,priority,
   dependencies_json,requirement_ids_json,acceptance_ids_json,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  coreId,goalId,projectId,"core","Core implementation",
  "Existing completed implementation","implementation","completed",0,
  "[]",'["req_core"]',"[]",now,now
 );

 db.prepare(`
  INSERT INTO development_sessions(
   id,project_id,goal_id,status,progress,current_milestone_id,recovery_count,
   pause_reason,created_at,updated_at,started_at,completed_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  sessionId,projectId,goalId,"active",50,null,0,null,now,now,now,null
 );

 const initialCycle=ensureDevelopmentCycle(sessionId);
 check("initial development cycle exists",()=>initialCycle.number===1);

 const before=evaluateDevelopmentContinuation(sessionId);
 check("coverage gap detected before continuation",()=>before.needsAdditionalWork);
 check("uncovered requirement identified",()=>before.evidence.uncoveredRequirementIds.includes("req_extra"));
 check("uncovered acceptance identified",()=>before.evidence.uncoveredAcceptanceIds.includes("acc_extra"));

 const result=applyDevelopmentContinuation(
  sessionId,
  [
   {
    key:"extra_impl",
    title:"Follow-up implementation",
    description:"Implement uncovered follow-up requirement.",
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
  ],
  "Coverage gaps require another development cycle."
 );

 check("two continuation work items added",()=>result.expansion.addedWorkItemIds.length===2);

 const rows=graph();
 const impl=rows.find(row=>row.work_key==="extra_impl");
 const test=rows.find(row=>row.work_key==="extra_test");

 check("follow-up implementation exists",()=>Boolean(impl));
 check("follow-up validation exists",()=>Boolean(test));
 check("implementation becomes executable",()=>["ready","running"].includes(impl.status));
 check("validation remains pending until implementation completes",()=>test.status==="pending");

 const cycles=listDevelopmentCycles(sessionId);
 check("second development cycle created",()=>cycles.length===2);
 check("first cycle marked continued",()=>cycles[0].status==="continued");
 check("second cycle active",()=>cycles[1].status==="active");
 check("second cycle reason persisted",()=>cycles[1].reason==="Coverage gaps require another development cycle.");

 const implAssignment=assignment("extra_impl");
 check("implementation receives team assignment",()=>Boolean(implAssignment));
 check("implementation assigned developer role",()=>implAssignment?.role==="developer");

 const implDispatch=dispatch("extra_impl");
 check("implementation receives persistent dispatch",()=>Boolean(implDispatch));
 check("implementation dispatch has task",()=>Boolean(implDispatch?.task_id));

 const implTask=task(implDispatch?.task_id);
 check("implementation task persisted",()=>Boolean(implTask));
 check("implementation task belongs to project",()=>implTask?.project_id===projectId);

 const implJobs=jobs(implDispatch?.task_id);
 check("implementation task receives queue job",()=>implJobs.length===1);

 check("validation not dispatched early",()=>!dispatch("extra_test"));
 check("validation not assigned early",()=>!assignment("extra_test"));

 const managed=goalExecutionForTask(implDispatch.task_id);
 check("follow-up task uses normal goal execution",()=>managed?.workItemId===impl.id);

 const completed=completeGoalTaskExecution(implDispatch.task_id);
 check("implementation completes through normal execution",()=>Boolean(completed));

 const afterImpl=graph();
 const implAfter=afterImpl.find(row=>row.work_key==="extra_impl");
 const testAfter=afterImpl.find(row=>row.work_key==="extra_test");

 check("implementation persisted completed",()=>implAfter.status==="completed");
 check("validation unlocks after dependency completion",()=>["ready","running"].includes(testAfter.status));

 const testAssignment=assignment("extra_test");
 check("validation receives assignment after unlock",()=>Boolean(testAssignment));
 check("validation assigned tester role",()=>testAssignment?.role==="tester");

 const testDispatch=dispatch("extra_test");
 check("validation dispatched after unlock",()=>Boolean(testDispatch));
 check("validation receives task",()=>Boolean(testDispatch?.task_id));
 check("validation task receives queue job",()=>jobs(testDispatch.task_id).length===1);

 const snapshot=goalExecutionSnapshot(goalId);
 check("execution snapshot contains expanded graph",()=>snapshot.graph.items.length===3);
 check("execution snapshot contains both follow-up dispatches",()=>
  snapshot.dispatches.some(item=>item.workItemId===impl.id)&&
  snapshot.dispatches.some(item=>item.workItemId===test.id)
 );

 const mid=evaluateDevelopmentContinuation(sessionId);
 check("goal remains incomplete before validation",()=>mid.decision==="continue");
 check("acceptance remains uncovered before validation completion",()=>
  mid.evidence.uncoveredAcceptanceIds.includes("acc_extra")
 );

 completeGoalTaskExecution(testDispatch.task_id);

 const final=evaluateDevelopmentContinuation(sessionId);
 check("goal becomes satisfied after continuation work",()=>final.goalSatisfied);
 check("continuation evaluator reaches complete",()=>final.decision==="complete");
 check("requirement coverage complete",()=>final.evidence.uncoveredRequirementIds.length===0);
 check("acceptance coverage complete",()=>final.evidence.uncoveredAcceptanceIds.length===0);

 check("original completed core remains preserved",()=>{
  const core=graph().find(row=>row.work_key==="core");
  return core?.id===coreId&&core?.status==="completed";
 });

 check("only two development cycles created",()=>listDevelopmentCycles(sessionId).length===2);
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
 try{db.prepare("DELETE FROM development_sessions WHERE id=?").run(sessionId);}catch{}
 try{db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 3 PASS 3.4");
console.log(" CONTINUATION ORCHESTRATION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 3.4 PASSED");
}else{
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 3.4 NOT YET CLOSED");
 process.exitCode=1;
}

