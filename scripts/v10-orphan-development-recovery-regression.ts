import crypto from"node:crypto";
import{db}from"../src/database/database.js";
import{recoverDevelopmentSession}from"../src/development/development-session.service.js";

const suffix=crypto.randomBytes(6).toString("hex");
const projectId=`orphan_project_${suffix}`;
const goalId=`orphan_goal_${suffix}`;
const sessionId=`orphan_session_${suffix}`;
const now=new Date().toISOString();
let failed=0;

function check(name:string,ok:boolean){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok)failed++;
}

try{
 db.prepare(`
  INSERT INTO development_sessions(
   id,project_id,goal_id,status,current_milestone_id,progress,
   recovery_count,last_checkpoint_at,pause_reason,failure,
   started_at,paused_at,resumed_at,completed_at,created_at,updated_at
  ) VALUES(?,?,?,'active',NULL,0,0,NULL,NULL,NULL,?,NULL,NULL,NULL,?,?)
 `).run(sessionId,projectId,goalId,now,now,now);

 const result=recoverDevelopmentSession(projectId);
 const row=db.prepare(`
  SELECT status,failure,recovery_count
  FROM development_sessions
  WHERE id=?
 `).get(sessionId) as any;

 check("orphan recovery returns snapshot",Boolean(result));
 check("orphan session is failed",row?.status==="failed");
 check("failure identifies missing goal",String(row?.failure||"").includes(goalId));
 check("orphan does not count as successful recovery",Number(row?.recovery_count||0)===0);

 const second=recoverDevelopmentSession(projectId);
 check("terminal orphan is ignored on repeated startup",second===null);

 console.log(`ORPHAN RECOVERY: ${5-failed}/5`);
}catch(error){
 console.error(error);
 failed++;
}finally{
 db.prepare("DELETE FROM development_milestones WHERE session_id=?").run(sessionId);
 db.prepare("DELETE FROM development_sessions WHERE id=?").run(sessionId);
}

process.exitCode=failed?1:0;
