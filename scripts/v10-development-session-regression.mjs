import assert from "node:assert/strict";
import crypto from "node:crypto";
import {db} from "../dist/database/database.js";
import {
 initializeDevelopmentSession,
 synchronizeDevelopmentSession,
 recoverDevelopmentSession,
 pauseDevelopmentSession,
 resumeDevelopmentSession,
 developmentSessionSnapshot
} from "../dist/development/development-session.service.js";
import {
 getDevelopmentSession,
 listDevelopmentMilestones,
 deleteDevelopmentSession
} from "../dist/development/development-session.repository.js";

let passed=0;
let failed=0;
const check=(name,value)=>{
 try{
  assert.ok(value);
  passed++;
  console.log(`PASS ${name}`);
 }catch(error){
  failed++;
  console.error(`FAIL ${name}`);
  console.error(error.message);
 }
};

const suffix=Date.now()+"_"+crypto.randomBytes(4).toString("hex");
const projectId=`prj_b3_${suffix}`;
const goalId=`gol_b3_${suffix}`;
const workspace=`C:\\VEYLITH\\veylith\\workspaces\\b3-${suffix}`;
const time=new Date().toISOString();

try{
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Batch 3 Session Regression",
  `batch-3-session-${suffix}`,
  "active",
  "autonomous_development",
  0,
  workspace,
  time,
  time
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,
   requirements_json,acceptance_criteria_json,constraints_json,
   created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?)
 `).run(
  goalId,
  projectId,
  "Build persistent long-running development",
  "Verify development sessions survive process lifecycle.",
  "active",
  "[]",
  "[]",
  "[]",
  time,
  time
 );

 const items=[
  ["arch","architecture","Architecture",100,[]],
  ["impl","implementation","Implementation",90,["arch"]],
  ["test","test","Validation",80,["impl"]],
  ["docs","documentation","Documentation",70,["impl"]],
  ["delivery","delivery","Delivery",60,["test","docs"]]
 ];

 const ids=new Map();

 for(const [key] of items){
  ids.set(key,`gwi_b3_${key}_${suffix}`);
 }

 for(const [key,kind,title,priority,deps] of items){
  const id=ids.get(key);
  const dependencyIds=deps.map(dep=>ids.get(dep));
  const status=key==="arch"?"ready":"pending";
  db.prepare(`
   INSERT INTO goal_work_items(
    id,goal_id,project_id,work_key,title,description,kind,status,
    priority,dependencies_json,requirement_ids_json,acceptance_ids_json,
    created_at,updated_at,started_at,completed_at
   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)
  `).run(
   id,goalId,projectId,key,title,`${title} work`,kind,status,priority,
   JSON.stringify(deps),"[]","[]",time,time
  );
 }

 const first=initializeDevelopmentSession(goalId);
 check("development session created",Boolean(first.session.id));
 check("session active",first.session.status==="active");
 check("session bound to project",first.session.projectId===projectId);
 check("session bound to goal",first.session.goalId===goalId);
 check("five milestone groups created",first.milestones.length===5);
 check("foundation milestone exists",first.milestones.some(x=>x.key==="foundation"));
 check("development milestone exists",first.milestones.some(x=>x.key==="development"));
 check("validation milestone exists",first.milestones.some(x=>x.key==="validation"));
 check("documentation milestone exists",first.milestones.some(x=>x.key==="documentation"));
 check("delivery milestone exists",first.milestones.some(x=>x.key==="delivery"));
 check("foundation initially active",first.milestones.find(x=>x.key==="foundation")?.status==="active");
 check("current milestone persisted",Boolean(first.session.currentMilestoneId));

 const duplicate=initializeDevelopmentSession(goalId);
 check("session initialization idempotent",duplicate.session.id===first.session.id);
 check("milestone initialization idempotent",duplicate.milestones.length===5);

 const stored=getDevelopmentSession(first.session.id);
 check("session survives repository reload",stored?.id===first.session.id);
 check("milestones survive repository reload",listDevelopmentMilestones(first.session.id).length===5);

 const paused=pauseDevelopmentSession(first.session.id,"Regression pause");
 check("session pauses",paused.session.status==="paused");
 check("pause reason persisted",paused.session.pauseReason==="Regression pause");

 const resumed=resumeDevelopmentSession(first.session.id);
 check("session resumes",resumed.session.status==="active");
 check("resume increments recovery counter",resumed.session.recoveryCount===1);

 const recovered=recoverDevelopmentSession(projectId);
 check("active session recoverable",Boolean(recovered));
 check("restart recovery increments counter",recovered?.session.recoveryCount===2);

 db.prepare(`
  UPDATE goal_work_items
  SET status='completed',started_at=?,completed_at=?,updated_at=?
  WHERE id=?
 `).run(time,time,time,ids.get("arch"));

 db.prepare(`
  UPDATE goal_work_items
  SET status='ready',updated_at=?
  WHERE id=?
 `).run(time,ids.get("impl"));

 const afterFoundation=synchronizeDevelopmentSession(first.session.id);
 check("foundation completes from graph state",afterFoundation.milestones.find(x=>x.key==="foundation")?.status==="completed");
 check("implementation becomes active",afterFoundation.milestones.find(x=>x.key==="development")?.status==="active");
 check("current milestone advances",afterFoundation.currentMilestone?.key==="development");
 check("session progress advances",afterFoundation.session.progress>0&&afterFoundation.session.progress<100);

 for(const id of ids.values()){
  db.prepare(`
   UPDATE goal_work_items
   SET status='completed',
       started_at=COALESCE(started_at,?),
       completed_at=?,
       updated_at=?
   WHERE id=?
  `).run(time,time,time,id);
 }

 const completed=synchronizeDevelopmentSession(first.session.id);
 check("all milestones complete",completed.milestones.every(x=>x.status==="completed"));
 check("session completes",completed.session.status==="completed");
 check("session progress reaches 100",completed.session.progress===100);
 check("current milestone clears",completed.session.currentMilestoneId===null);

 const goal=db.prepare("SELECT status FROM project_goals WHERE id=?").get(goalId);
 check("goal completes with session",goal?.status==="completed");

 const persisted=developmentSessionSnapshot(first.session.id);
 check("completed session reloads",persisted.session.status==="completed");
 check("completed milestone state reloads",persisted.milestones.every(x=>x.status==="completed"));
 check("completed session cannot recover as active",recoverDevelopmentSession(projectId)===null);

 const memoryRows=db.prepare(`
  SELECT * FROM project_memory
  WHERE project_id=? AND type='development_session'
 `).all(projectId);
 check("session lifecycle persisted to memory",memoryRows.length>=2);

 const events=db.prepare(`
  SELECT * FROM events
  WHERE project_id=? AND type LIKE 'development.session.%'
 `).all(projectId);
 check("session lifecycle telemetry emitted",events.length>=3);

 check("session cleanup succeeds",deleteDevelopmentSession(first.session.id));
 check("session cleanup persisted",getDevelopmentSession(first.session.id)===null);
 check("milestone cleanup persisted",listDevelopmentMilestones(first.session.id).length===0);
}finally{
 try{db.prepare("DELETE FROM project_memory WHERE project_id=?").run(projectId)}catch{}
 try{db.prepare("DELETE FROM events WHERE project_id=?").run(projectId)}catch{}
 try{db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId)}catch{}
 try{db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId)}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId)}catch{}
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 3 PASS 1");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 1 PASSED");
}else{
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 1 NOT YET PASSED");
 process.exitCode=1;
}



