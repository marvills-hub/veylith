import assert from"node:assert/strict";
import{randomBytes}from"node:crypto";
import{db}from"../dist/database/database.js";
import{
 deleteDevelopmentCycles,
 getDevelopmentCycle
}from"../dist/development/development-cycle.repository.js";
import{ensureDevelopmentCycle}from"../dist/development/development-cycle.service.js";
import{
 evaluateAndMarkDevelopmentCycle,
 evaluateDevelopmentContinuation
}from"../dist/development/continuation-evaluator.service.js";

let passed=0,failed=0;
function check(name,fn){
 try{assert.ok(fn());passed++;console.log(`PASS ${name}`);}
 catch(error){failed++;console.log(`FAIL ${name}`);console.log(error.message);}
}
const suffix=Date.now().toString(36)+randomBytes(3).toString("hex");
const projectId=`prj_b3p32_${suffix}`;
const goalId=`goal_b3p32_${suffix}`;
const sessionId=`ses_b3p32_${suffix}`;
const now=new Date().toISOString();

const work={
 impl:`wrk_impl_${suffix}`,
 test:`wrk_test_${suffix}`,
 docs:`wrk_docs_${suffix}`
};

function setStatus(id,status){
 db.prepare(`
  UPDATE goal_work_items SET status=?,updated_at=? WHERE id=?
 `).run(status,new Date().toISOString(),id);
}
function setCoverage(id,requirements,acceptance){
 db.prepare(`
  UPDATE goal_work_items
  SET requirement_ids_json=?,acceptance_ids_json=?,updated_at=?
  WHERE id=?
 `).run(
  JSON.stringify(requirements),
  JSON.stringify(acceptance),
  new Date().toISOString(),
  id
 );
}

try{
 db.prepare(`
  INSERT INTO projects(id,name,slug,status,progress,workspace,created_at,updated_at,phase)
  VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,"Batch 3 Pass 3.2",`b3p32-${suffix}`,"active",0,
  `workspaces/b3p32-${suffix}`,now,now,"autonomous_development"
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,priority,requirements_json,
   acceptance_criteria_json,constraints_json,source_task_id,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  goalId,projectId,"Continuation evaluator","Evaluate autonomous continuation",
  "active",0,
  JSON.stringify([{id:"req_api",text:"API implementation"}]),
  JSON.stringify([{id:"acc_test",text:"Tests pass"}]),
  "[]",null,now,now
 );

 const insert=db.prepare(`
  INSERT INTO goal_work_items(
   id,goal_id,project_id,work_key,title,description,kind,status,priority,
   dependencies_json,requirement_ids_json,acceptance_ids_json,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `);

 insert.run(
  work.impl,goalId,projectId,"impl","Implementation","Implement API",
  "implementation","completed",0,"[]",'["req_api"]',"[]",now,now
 );
 insert.run(
  work.test,goalId,projectId,"test","Validation","Validate API",
  "test","ready",0,'["impl"]',"[]",'["acc_test"]',now,now
 );
 insert.run(
  work.docs,goalId,projectId,"docs","Documentation","Document API",
  "documentation","blocked",0,'["impl"]',"[]","[]",now,now
 );

 db.prepare(`
  INSERT INTO development_sessions(
   id,project_id,goal_id,status,progress,current_milestone_id,recovery_count,
   pause_reason,created_at,updated_at,started_at,completed_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  sessionId,projectId,goalId,"active",33,null,0,null,now,now,now,null
 );

 const cycle=ensureDevelopmentCycle(sessionId);
 check("development cycle available",()=>cycle.status==="active");

 let evaluation=evaluateDevelopmentContinuation(sessionId);
 check("runnable work chooses continue",()=>evaluation.decision==="continue");
 check("goal not yet satisfied",()=>!evaluation.goalSatisfied);
 check("test recognized runnable",()=>evaluation.evidence.runnableWorkItemIds.includes(work.test));
 check("acceptance uncovered until completed",()=>evaluation.evidence.uncoveredAcceptanceIds.includes("acc_test"));
 check("requirement covered by completed implementation",()=>evaluation.evidence.uncoveredRequirementIds.length===0);
 check("graph not terminal with ready work",()=>!evaluation.graphTerminal);

 setStatus(work.test,"failed");
 evaluation=evaluateDevelopmentContinuation(sessionId);
 check("failed work chooses repair",()=>evaluation.decision==="repair");
 check("failed test recorded",()=>evaluation.evidence.failedWorkItemIds.includes(work.test));
 check("failed count recorded",()=>evaluation.evidence.failedWork===1);
 check("failed acceptance remains uncovered",()=>evaluation.evidence.uncoveredAcceptanceIds.includes("acc_test"));

 setStatus(work.test,"completed");
 setStatus(work.docs,"completed");
 evaluation=evaluateDevelopmentContinuation(sessionId);
 check("all work complete chooses complete",()=>evaluation.decision==="complete");
 check("goal satisfied after completed coverage",()=>evaluation.goalSatisfied);
 check("graph terminal when all complete",()=>evaluation.graphTerminal);
 check("acceptance covered after test completion",()=>evaluation.evidence.uncoveredAcceptanceIds.length===0);
 check("all three work items counted complete",()=>evaluation.evidence.completedWork===3);

 setCoverage(work.impl,[],[]);
 evaluation=evaluateDevelopmentContinuation(sessionId);
 check("missing requirement coverage prevents completion",()=>evaluation.decision==="continue");
 check("additional work required for uncovered requirement",()=>evaluation.needsAdditionalWork);
 check("uncovered requirement identified",()=>evaluation.evidence.uncoveredRequirementIds.includes("req_api"));

 setCoverage(work.impl,["req_api"],[]);
 setStatus(work.docs,"blocked");
 evaluation=evaluateDevelopmentContinuation(sessionId);
 check("terminal blocked work chooses blocked",()=>evaluation.decision==="blocked");
 check("blocked work identified",()=>evaluation.evidence.blockedWorkItemIds.includes(work.docs));

 setStatus(work.docs,"ready");
 evaluation=evaluateAndMarkDevelopmentCycle(sessionId);
 check("evaluation returns continue after ready work",()=>evaluation.decision==="continue");
 const marked=getDevelopmentCycle(cycle.id);
 check("cycle enters evaluating state",()=>marked?.status==="evaluating");
 check("cycle stores evaluation reason",()=>Boolean(marked?.reason));
 check("cycle stores evaluation summary",()=>Boolean(marked?.summary));
 const summary=JSON.parse(marked?.summary||"{}");
 check("persisted summary contains decision",()=>summary.decision==="continue");
 check("persisted summary contains evidence",()=>summary.evidence?.readyWork===1);

 setStatus(work.docs,"completed");
 evaluation=evaluateDevelopmentContinuation(sessionId);
 check("final state completes again",()=>evaluation.decision==="complete");
 check("final goal satisfaction true",()=>evaluation.goalSatisfied);

 deleteDevelopmentCycles(sessionId);
 check("cycle cleanup succeeds",()=>getDevelopmentCycle(cycle.id)===null);
}finally{
 try{deleteDevelopmentCycles(sessionId);}catch{}
 try{db.prepare("DELETE FROM development_sessions WHERE id=?").run(sessionId);}catch{}
 try{db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 3 PASS 3.2");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
if(failed===0)console.log("\nVEYLITH v1.0 BATCH 3 PASS 3.2 PASSED");
else{
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 3.2 NOT YET CLOSED");
 process.exitCode=1;
}
