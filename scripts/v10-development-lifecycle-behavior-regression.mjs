import assert from "node:assert/strict";
import crypto from "node:crypto";
import {db} from "../dist/database/database.js";
import {
 synchronizeTaskDevelopment,
 recoverActiveDevelopmentSessions
} from "../dist/development/development-lifecycle.service.js";
import {
 getDevelopmentSession,
 listDevelopmentMilestones,
 deleteDevelopmentSession
} from "../dist/development/development-session.repository.js";
import {
 prepareGoalTaskExecution,
 completeGoalTaskExecution,
 failGoalTaskExecution
} from "../dist/team/goal-team-execution.service.js";

let passed=0;
let failed=0;

function check(name,value){
 try{
  assert.ok(value);
  passed++;
  console.log(`PASS ${name}`);
 }catch(error){
  failed++;
  console.error(`FAIL ${name}`);
  console.error(error.message);
 }
}

const suffix=Date.now()+"_"+crypto.randomBytes(4).toString("hex");
const projectId=`prj_b3p2_${suffix}`;
const goalId=`gol_b3p2_${suffix}`;
const workspace=`C:\\VEYLITH\\veylith\\workspaces\\b3p2-${suffix}`;
const time=new Date().toISOString();

const items=[
 ["arch","architecture","Architecture",100,[]],
 ["impl","implementation","Implementation",90,["arch"]],
 ["test","test","Validation",80,["impl"]],
 ["docs","documentation","Documentation",70,["impl"]],
 ["delivery","delivery","Delivery",60,["test","docs"]]
];

const ids=new Map();
const taskIds=new Map();
let sessionId=null;

function taskFor(key){
 return taskIds.get(key);
}

function session(){
 return db.prepare(`
  SELECT *
  FROM development_sessions
  WHERE goal_id=?
  ORDER BY created_at DESC
  LIMIT 1
 `).get(goalId);
}

function milestone(key){
 if(!sessionId)return null;
 return db.prepare(`
  SELECT *
  FROM development_milestones
  WHERE session_id=? AND milestone_key=?
 `).get(sessionId,key);
}

try{
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Batch 3 Pass 2 Behavioral Regression",
  `batch-3-pass-2-${suffix}`,
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
  "Automatic development lifecycle",
  "Verify development sessions follow real goal execution state.",
  "active",
  "[]",
  "[]",
  "[]",
  time,
  time
 );

 for(const [key] of items){
  ids.set(key,`gwi_b3p2_${key}_${suffix}`);
  taskIds.set(key,`tsk_b3p2_${key}_${suffix}`);
 }

 for(const [key,kind,title,priority,deps] of items){
  db.prepare(`
   INSERT INTO goal_work_items(
    id,goal_id,project_id,work_key,title,description,kind,status,
    priority,dependencies_json,requirement_ids_json,acceptance_ids_json,
    created_at,updated_at,started_at,completed_at
   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)
  `).run(
   ids.get(key),
   goalId,
   projectId,
   key,
   title,
   `${title} work`,
   kind,
   key==="arch"?"ready":"pending",
   priority,
   JSON.stringify(deps),
   "[]",
   "[]",
   time,
   time
  );
 }

 for(const [key] of items){
  const taskId=taskIds.get(key);

  db.prepare(`
   INSERT INTO tasks(
    id,project_id,title,prompt,status,phase,priority,attempts,max_attempts,
    repair_attempts,created_at,updated_at
   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
   taskId,
   projectId,
   `Batch 3 Pass 2 ${key}`,
   `Batch 3 Pass 2 ${key}`,
   "queued",
   "queued",
   0,
   0,
   3,
   0,
   time,
   time
  );

  db.prepare(`
   INSERT INTO goal_work_dispatches(
    work_item_id,goal_id,project_id,task_id,job_id,status,created_at,updated_at
   ) VALUES(?,?,?,?,?,?,?,?)
  `).run(
   ids.get(key),
   goalId,
   projectId,
   taskId,
   null,
   "queued",
   time,
   time
  );
 }

 check("session absent before lifecycle hook",session()===undefined);

 const created=synchronizeTaskDevelopment(taskFor("arch"));
 check("task lifecycle creates session automatically",Boolean(created?.session?.id));

 sessionId=created?.session?.id??null;

 check("automatic session persisted",Boolean(sessionId&&getDevelopmentSession(sessionId)));
 check("automatic session has five milestones",listDevelopmentMilestones(sessionId).length===5);
 check("foundation starts active",created?.currentMilestone?.key==="foundation");

 const prepared=prepareGoalTaskExecution(taskFor("arch"));
 check("real execution preparation succeeds",Boolean(prepared));
 check("architecture work enters running state",
  db.prepare("SELECT status FROM goal_work_items WHERE id=?")
   .get(ids.get("arch"))?.status==="running"
 );

 const running=synchronizeTaskDevelopment(taskFor("arch"));
 check("running work keeps foundation active",
  running?.milestones?.find(x=>x.key==="foundation")?.status==="active"
 );

 completeGoalTaskExecution(taskFor("arch"));
 const afterArchitecture=synchronizeTaskDevelopment(taskFor("arch"));

 check("architecture completion closes foundation",
  afterArchitecture?.milestones?.find(x=>x.key==="foundation")?.status==="completed"
 );
 check("development milestone automatically activates",
  afterArchitecture?.milestones?.find(x=>x.key==="development")?.status==="active"
 );
 check("current milestone advances to development",
  afterArchitecture?.currentMilestone?.key==="development"
 );
 check("session progress advances automatically",
  afterArchitecture?.session?.progress>0&&afterArchitecture?.session?.progress<100
 );

 const implState=db.prepare(
  "SELECT status FROM goal_work_items WHERE id=?"
 ).get(ids.get("impl"));

 check("goal execution makes implementation runnable",
  ["ready","running"].includes(implState?.status)
 );

 db.prepare(`
  UPDATE goal_work_items
  SET status='running',started_at=?,updated_at=?
  WHERE id=?
 `).run(time,time,ids.get("impl"));

 const developmentRunning=synchronizeTaskDevelopment(taskFor("impl"));
 check("implementation running reflected in development milestone",
  developmentRunning?.milestones?.find(x=>x.key==="development")?.status==="active"
 );

 db.prepare(`
  UPDATE goal_work_items
  SET status='completed',completed_at=?,updated_at=?
  WHERE id=?
 `).run(time,time,ids.get("impl"));

 db.prepare(`
  UPDATE goal_work_items
  SET status='ready',updated_at=?
  WHERE id IN (?,?)
 `).run(time,ids.get("test"),ids.get("docs"));

 const afterImplementation=synchronizeTaskDevelopment(taskFor("impl"));

 check("development milestone completes from persisted DAG",
  afterImplementation?.milestones?.find(x=>x.key==="development")?.status==="completed"
 );
 check("validation milestone activates",
  afterImplementation?.milestones?.find(x=>x.key==="validation")?.status==="active"
 );
 check("documentation milestone activates",
  afterImplementation?.milestones?.find(x=>x.key==="documentation")?.status==="active"
 );

 db.prepare(`
  UPDATE goal_work_items
  SET status='running',started_at=?,updated_at=?
  WHERE id=?
 `).run(time,time,ids.get("test"));

 const beforeFailure=synchronizeTaskDevelopment(taskFor("test"));
 check("validation work reflected before failure",
  beforeFailure?.milestones?.find(x=>x.key==="validation")?.status==="active"
 );

 failGoalTaskExecution(taskFor("test"),"failed");
 const afterFailure=synchronizeTaskDevelopment(taskFor("test"));


 check("real goal failure persisted",
  db.prepare("SELECT status FROM goal_work_items WHERE id=?")
   .get(ids.get("test"))?.status==="failed"
 );
 check("validation milestone reflects failure",
  afterFailure?.milestones?.find(x=>x.key==="validation")?.status==="failed"
 );
 check("failed milestone does not prematurely terminate session",
  afterFailure?.session?.status==="active"
 );
 check("independent documentation work remains active",
  afterFailure?.milestones?.find(x=>x.key==="documentation")?.status==="active"
 );

 const beforeRecovery=getDevelopmentSession(sessionId);
 const beforeCount=beforeRecovery?.recoveryCount??0;

 const recovered=recoverActiveDevelopmentSessions();
 const afterRecovery=getDevelopmentSession(sessionId);

 check("startup recovery discovers active development session",
  recovered.some(x=>x?.session?.id===sessionId)
 );
 check("startup recovery increments recovery counter",
  (afterRecovery?.recoveryCount??0)>beforeCount
 );
 check("restart recovery preserves failed validation state",
  milestone("validation")?.status==="failed"
 );
 check("restart recovery preserves session persistence",
  Boolean(getDevelopmentSession(sessionId))
 );

 check("legacy unrelated task remains unmanaged",
  synchronizeTaskDevelopment(`tsk_unmanaged_${suffix}`)===null
 );

 console.log("\n============================================================");
 console.log(" VEYLITH v1.0 BATCH 3 PASS 2");
 console.log(" BEHAVIORAL RESULT");
 console.log("============================================================");
 console.log(`Passed: ${passed}`);
 console.log(`Failed: ${failed}`);
 console.log(`Total:  ${passed+failed}`);

 if(failed===0){
  console.log("\nVEYLITH v1.0 BATCH 3 PASS 2 BEHAVIORAL REGRESSION PASSED");
 }else{
  console.log("\nVEYLITH v1.0 BATCH 3 PASS 2 NOT YET CLOSED");
  process.exitCode=1;
 }
}finally{
 try{
  if(sessionId)deleteDevelopmentSession(sessionId);
 }catch{}

 try{
  db.prepare("DELETE FROM agent_handoffs WHERE goal_id=?").run(goalId);
 }catch{}

 try{
  db.prepare("DELETE FROM agent_assignments WHERE goal_id=?").run(goalId);
 }catch{}

 try{
  db.prepare("DELETE FROM goal_work_dispatches WHERE goal_id=?").run(goalId);
 }catch{}

 try{
  db.prepare("DELETE FROM jobs WHERE project_id=?").run(projectId);
 }catch{}

 try{
  db.prepare("DELETE FROM tasks WHERE project_id=?").run(projectId);
 }catch{}

 try{
  db.prepare("DELETE FROM project_memory WHERE project_id=?").run(projectId);
 }catch{}

 try{
  db.prepare("DELETE FROM events WHERE project_id=?").run(projectId);
 }catch{}

 try{
  db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId);
 }catch{}

 try{
  db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId);
 }catch{}

 try{
  db.prepare("DELETE FROM projects WHERE id=?").run(projectId);
 }catch{}
}




