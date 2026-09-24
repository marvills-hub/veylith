import {db} from "../database/database.js";
import {
 initializeDevelopmentSession,
 synchronizeDevelopmentSession,
 recoverDevelopmentSession
} from "./development-session.service.js";

function goalForTask(taskId:string){
 return db.prepare(`
  SELECT g.id AS goal_id,g.project_id
  FROM goal_work_dispatches d
  JOIN project_goals g ON g.id=d.goal_id
  WHERE d.task_id=?
  LIMIT 1
 `).get(taskId) as {goal_id:string;project_id:string}|undefined;
}

function latestSession(goalId:string){
 return db.prepare(`
  SELECT id,status
  FROM development_sessions
  WHERE goal_id=?
  ORDER BY created_at DESC
  LIMIT 1
 `).get(goalId) as {id:string;status:string}|undefined;
}

export function synchronizeGoalDevelopment(goalId:string){
 const goal=db.prepare(`
  SELECT id,project_id
  FROM project_goals
  WHERE id=?
 `).get(goalId) as {id:string;project_id:string}|undefined;
 if(!goal)return null;

 let session=latestSession(goalId);

 if(!session){
  const created=initializeDevelopmentSession(goalId);
  session={id:created.session.id,status:created.session.status};
 }

 if(session.status==="completed"||session.status==="failed"||session.status==="cancelled"){
  return synchronizeDevelopmentSession(session.id);
 }

 return synchronizeDevelopmentSession(session.id);
}

export function synchronizeTaskDevelopment(taskId:string){
 const managed=goalForTask(taskId);
 if(!managed)return null;
 return synchronizeGoalDevelopment(managed.goal_id);
}

export function recoverActiveDevelopmentSessions(){
 const rows=db.prepare(`
  SELECT DISTINCT project_id
  FROM development_sessions
  WHERE status IN ('active','paused')
  ORDER BY project_id
 `).all() as {project_id:string}[];

 const recovered=[];

 for(const row of rows){
  const snapshot=recoverDevelopmentSession(row.project_id);
  if(snapshot)recovered.push(snapshot);
 }

 return recovered;
}

