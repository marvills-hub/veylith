import{randomBytes}from"node:crypto";
import{spawnSync}from"node:child_process";
import{db}from"../dist/database/database.js";
import{
 createDevelopmentSession,
 getDevelopmentSession,
 createDevelopmentMilestone,
 updateDevelopmentMilestone
}from"../dist/development/development-session.repository.js";
import{
 createDevelopmentCycle,
 listDevelopmentCycles
}from"../dist/development/development-cycle.repository.js";

let passed=0;
let failed=0;
function check(name,condition,detail=""){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${name}`);
  if(detail)console.log(detail);
 }
}

const suffix=Date.now().toString(36)+randomBytes(3).toString("hex");
const projectId=`prj_b3restart_${suffix}`;
const goalId=`goal_b3restart_${suffix}`;
const workId=`wrk_b3restart_${suffix}`;
const now=new Date().toISOString();

let sessionId=null;
let milestoneId=null;
let cycleId=null;

try{
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,progress,workspace,created_at,updated_at,phase
  )VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Batch 3 Restart Probe",
  `batch3-restart-${suffix}`,
  "active",
  35,
  `workspaces/batch3-restart-${suffix}`,
  now,
  now,
  "autonomous_development"
 );

 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,priority,
   requirements_json,acceptance_criteria_json,constraints_json,
   source_task_id,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  goalId,
  projectId,
  "Persistent long-running development",
  "Verify development state survives a fresh Veylith process.",
  "active",
  0,
  JSON.stringify([
   {id:"req_restart",text:"Persistent restart state",required:true}
  ]),
  JSON.stringify([
   {id:"acc_restart",text:"State survives process restart"}
  ]),
  "[]",
  null,
  now,
  now
 );

 db.prepare(`
  INSERT INTO goal_work_items(
   id,goal_id,project_id,work_key,title,description,kind,status,priority,
   dependencies_json,requirement_ids_json,acceptance_ids_json,
   created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  workId,
  goalId,
  projectId,
  "restart-work",
  "Restart persistence work",
  "Work intentionally remains unfinished across restart.",
  "implementation",
  "ready",
  50,
  "[]",
  '["req_restart"]',
  "[]",
  now,
  now
 );

 const session=createDevelopmentSession(projectId,goalId);
 sessionId=session.id;

 check(
  "production repository creates development session",
  Boolean(sessionId)
 );

 const milestone=createDevelopmentMilestone({
  sessionId,
  projectId,
  goalId,
  key:"development",
  title:"Development",
  description:"Persistent development milestone restart probe.",
  sequence:1,
  workItemIds:[workId]
 });
 milestoneId=milestone.id;

 check(
  "production repository creates development milestone",
  Boolean(milestoneId)
 );

 const activeMilestone=updateDevelopmentMilestone(
  milestoneId,
  "active",
  35
 );

 check(
  "production repository activates milestone",
  activeMilestone.status==="active"&&activeMilestone.progress===35
 );

 db.prepare(`
  UPDATE development_sessions
  SET current_milestone_id=?,progress=?,updated_at=?
  WHERE id=?
 `).run(milestoneId,35,new Date().toISOString(),sessionId);

 const cycle=createDevelopmentCycle({
  sessionId,
  projectId,
  goalId,
  reason:"Restart persistence probe",
  workItemIds:[workId]
 });
 cycleId=cycle.id;

 check(
  "production repository creates development cycle",
  Boolean(cycleId)
 );

 const before=getDevelopmentSession(sessionId);

 check(
  "session persisted before restart",
  Boolean(before&&before.id===sessionId)
 );

 check(
  "session active before restart",
  before?.status==="active"
 );

 check(
  "session references active milestone",
  before?.currentMilestoneId===milestoneId
 );

 const child=spawnSync(
  process.execPath,
  [
   "scripts/v10-development-restart-child.mjs",
   sessionId,
   milestoneId,
   cycleId,
   workId,
   goalId,
   projectId
  ],
  {
   cwd:process.cwd(),
   encoding:"utf8",
   env:{...process.env}
  }
 );

 if(child.stdout)process.stdout.write(child.stdout);
 if(child.stderr)process.stderr.write(child.stderr);

 check(
  "fresh Node process exits successfully",
  child.status===0,
  `Child exit code: ${child.status}`
 );

 check(
  "fresh process confirmed persistent session",
  child.stdout?.includes("RESTART_SESSION_OK")
 );

 check(
  "fresh process confirmed persistent milestone",
  child.stdout?.includes("RESTART_MILESTONE_OK")
 );

 check(
  "fresh process confirmed persistent cycle",
  child.stdout?.includes("RESTART_CYCLE_OK")
 );

 check(
  "fresh process confirmed persistent goal work",
  child.stdout?.includes("RESTART_WORK_OK")
 );

 check(
  "fresh process confirmed project and goal ownership",
  child.stdout?.includes("RESTART_OWNERSHIP_OK")
 );

 const after=getDevelopmentSession(sessionId);

 check(
  "parent reloads same session after fresh process",
  Boolean(after&&after.id===sessionId)
 );

 check(
  "restart does not terminalize session",
  after?.status==="active"
 );

 check(
  "restart preserves session progress",
  after?.progress===35
 );

 check(
  "restart preserves current milestone",
  after?.currentMilestoneId===milestoneId
 );

 const work=db.prepare(`
  SELECT status
  FROM goal_work_items
  WHERE id=?
 `).get(workId);

 check(
  "restart preserves unfinished work state",
  work?.status==="ready"
 );

 const cycles=listDevelopmentCycles(sessionId);

 check(
  "restart creates no duplicate cycle",
  cycles.length===1
 );

 const sessionCount=db.prepare(`
  SELECT COUNT(*) AS count
  FROM development_sessions
  WHERE goal_id=?
 `).get(goalId);

 check(
  "restart creates no duplicate session",
  Number(sessionCount?.count)===1
 );

 const milestoneCount=db.prepare(`
  SELECT COUNT(*) AS count
  FROM development_milestones
  WHERE session_id=?
 `).get(sessionId);

 check(
  "restart creates no duplicate milestone",
  Number(milestoneCount?.count)===1
 );
}finally{
 if(sessionId){
  try{
   db.prepare("DELETE FROM development_cycles WHERE session_id=?")
    .run(sessionId);
  }catch{}
  try{
   db.prepare("DELETE FROM development_milestones WHERE session_id=?")
    .run(sessionId);
  }catch{}
  try{
   db.prepare("DELETE FROM development_sessions WHERE id=?")
    .run(sessionId);
  }catch{}
 }
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

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 3 RESTART / PERSISTENCE GATE");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH BATCH 3 RESTART / PERSISTENCE PASSED");
}else{
 console.log("\nVEYLITH BATCH 3 RESTART / PERSISTENCE NOT YET CLOSED");
 process.exitCode=1;
}
