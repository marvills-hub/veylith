import assert from"node:assert/strict";
import{randomBytes}from"node:crypto";
import{db}from"../dist/database/database.js";
import{
 createDevelopmentCycle,
 deleteDevelopmentCycles,
 getActiveDevelopmentCycle,
 getDevelopmentCycle,
 getLatestDevelopmentCycle,
 listDevelopmentCycles,
 setDevelopmentCycleState,
 setDevelopmentCycleWork
}from"../dist/development/development-cycle.repository.js";
import{
 beginDevelopmentContinuation,
 developmentCycleSnapshot,
 ensureDevelopmentCycle,
 synchronizeDevelopmentCycle
}from"../dist/development/development-cycle.service.js";

let passed=0,failed=0;
function check(name,fn){
 try{assert.ok(fn());passed++;console.log(`PASS ${name}`);}
 catch(error){failed++;console.log(`FAIL ${name}`);console.log(error.message);}
}
const suffix=Date.now().toString(36)+randomBytes(3).toString("hex");
const projectId=`prj_b3p3_${suffix}`;
const goalId=`goal_b3p3_${suffix}`;
const sessionId=`ses_b3p3_${suffix}`;
const work1=`wrk_b3p3_a_${suffix}`;
const work2=`wrk_b3p3_b_${suffix}`;
const now=new Date().toISOString();

try{
 db.prepare(`
  INSERT INTO projects(id,name,slug,status,progress,workspace,created_at,updated_at,phase)
  VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,"Batch 3 Pass 3 Cycle Test",`b3p3-${suffix}`,"active",0,
  `workspaces/b3p3-${suffix}`,now,now,"autonomous_development"
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,priority,requirements_json,
   acceptance_criteria_json,constraints_json,source_task_id,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  goalId,projectId,"Persistent cycles","Verify long-running cycles","active",0,
  "[]","[]","[]",null,now,now
 );

 db.prepare(`
  INSERT INTO goal_work_items(
   id,goal_id,project_id,work_key,title,description,kind,status,priority,
   dependencies_json,requirement_ids_json,acceptance_ids_json,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  work1,goalId,projectId,"implementation","Implementation","Implement","implementation",
  "running",0,"[]","[]","[]",now,now
 );

 db.prepare(`
  INSERT INTO goal_work_items(
   id,goal_id,project_id,work_key,title,description,kind,status,priority,
   dependencies_json,requirement_ids_json,acceptance_ids_json,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  work2,goalId,projectId,"validation","Validation","Validate","test",
  "blocked",0,'["implementation"]',"[]","[]",now,now
 );

 db.prepare(`
  INSERT INTO development_sessions(
   id,project_id,goal_id,status,progress,current_milestone_id,recovery_count,
   pause_reason,created_at,updated_at,started_at,completed_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  sessionId,projectId,goalId,"active",0,null,0,null,now,now,now,null
 );

 check("cycle absent initially",()=>listDevelopmentCycles(sessionId).length===0);

 const first=ensureDevelopmentCycle(sessionId);
 check("initial cycle created",()=>first.number===1);
 check("initial cycle active",()=>first.status==="active");
 check("initial cycle bound to session",()=>first.sessionId===sessionId);
 check("initial cycle bound to project",()=>first.projectId===projectId);
 check("initial cycle bound to goal",()=>first.goalId===goalId);
 check("initial cycle tracks unfinished work",()=>first.workItemIds.length===2);
 check("ensure cycle idempotent",()=>ensureDevelopmentCycle(sessionId).id===first.id);
 check("only one initial cycle",()=>listDevelopmentCycles(sessionId).length===1);
 check("active cycle reloads",()=>getActiveDevelopmentCycle(sessionId)?.id===first.id);
 check("cycle reloads by id",()=>getDevelopmentCycle(first.id)?.number===1);

 setDevelopmentCycleState(first.id,"evaluating",{reason:"Cycle evaluation"});
 check("cycle enters evaluation",()=>getDevelopmentCycle(first.id)?.status==="evaluating");

 setDevelopmentCycleWork(first.id,[work2]);
 check("cycle work update persists",()=>getDevelopmentCycle(first.id)?.workItemIds.length===1);

 const second=beginDevelopmentContinuation(sessionId,"More development required");
 check("first cycle becomes continued",()=>getDevelopmentCycle(first.id)?.status==="continued");
 check("second cycle created",()=>second.number===2);
 check("second cycle active",()=>second.status==="active");
 check("second cycle contains unfinished work",()=>second.workItemIds.includes(work1)&&second.workItemIds.includes(work2));
 check("latest cycle is second",()=>getLatestDevelopmentCycle(sessionId)?.id===second.id);
 check("active cycle is second",()=>getActiveDevelopmentCycle(sessionId)?.id===second.id);
 check("cycle history has two entries",()=>listDevelopmentCycles(sessionId).length===2);

 const synced=synchronizeDevelopmentCycle(sessionId);
 check("active session keeps cycle active",()=>synced.status==="active");

 db.prepare(`
  UPDATE goal_work_items SET status='completed',updated_at=? WHERE goal_id=?
 `).run(new Date().toISOString(),goalId);
 db.prepare(`
  UPDATE development_sessions
  SET status='completed',progress=100,current_milestone_id=NULL,
      completed_at=?,updated_at=?
  WHERE id=?
 `).run(new Date().toISOString(),new Date().toISOString(),sessionId);

 const completed=synchronizeDevelopmentCycle(sessionId);
 check("completed session completes cycle",()=>completed.status==="completed");
 check("completed cycle records completion",()=>completed.completedAt!==null);
 check("completed cycle clears unfinished work",()=>completed.workItemIds.length===0);
 check("completed session does not create third cycle",()=>ensureDevelopmentCycle(sessionId).id===second.id);
 check("cycle history remains two entries",()=>developmentCycleSnapshot(sessionId).cycles.length===2);
 check("no active cycle after completion",()=>developmentCycleSnapshot(sessionId).active===null);

 const persisted=developmentCycleSnapshot(sessionId);
 check("cycle one history persisted",()=>persisted.cycles[0].status==="continued");
 check("cycle two history persisted",()=>persisted.cycles[1].status==="completed");

 deleteDevelopmentCycles(sessionId);
 check("cycle cleanup succeeds",()=>listDevelopmentCycles(sessionId).length===0);
}finally{
 try{deleteDevelopmentCycles(sessionId);}catch{}
 try{db.prepare("DELETE FROM development_sessions WHERE id=?").run(sessionId);}catch{}
 try{db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 3 PASS 3.1");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
if(failed===0)console.log("\nVEYLITH v1.0 BATCH 3 PASS 3.1 PASSED");
else{
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 3.1 NOT YET CLOSED");
 process.exitCode=1;
}
