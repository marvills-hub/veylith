import{db}from"../database/database.js";
import{getDevelopmentSession}from"./development-session.repository.js";
import{
 createDevelopmentCycle,
 getActiveDevelopmentCycle,
 getLatestDevelopmentCycle,
 listDevelopmentCycles,
 setDevelopmentCycleState,
 setDevelopmentCycleWork
}from"./development-cycle.repository.js";

function sessionWork(goalId:string){
 return db.prepare(`
  SELECT id,status
  FROM goal_work_items
  WHERE goal_id=?
  ORDER BY created_at ASC,id ASC
 `).all(goalId) as any[];
}
function unfinishedWork(goalId:string){
 return sessionWork(goalId)
  .filter(item=>!["completed","cancelled"].includes(String(item.status)))
  .map(item=>String(item.id));
}
export function ensureDevelopmentCycle(sessionId:string){
 const session=getDevelopmentSession(sessionId);
 if(!session)throw new Error(`Development session not found: ${sessionId}`);
 const active=getActiveDevelopmentCycle(sessionId);
 if(active)return active;
 const latest=getLatestDevelopmentCycle(sessionId);
 if(latest?.status==="completed"&&session.status==="completed")return latest;
 return createDevelopmentCycle({
  sessionId,
  projectId:session.projectId,
  goalId:session.goalId,
  workItemIds:unfinishedWork(session.goalId),
  reason:latest?"Continuation cycle":"Initial development cycle"
 });
}
export function synchronizeDevelopmentCycle(sessionId:string){
 const session=getDevelopmentSession(sessionId);
 if(!session)throw new Error(`Development session not found: ${sessionId}`);
 const cycle=ensureDevelopmentCycle(sessionId);
 const remaining=unfinishedWork(session.goalId);
 setDevelopmentCycleWork(cycle.id,remaining);
 if(session.status==="completed"){
  return setDevelopmentCycleState(cycle.id,"completed",{
   summary:"Development goal completed."
  });
 }
 if(session.status==="cancelled"){
  return setDevelopmentCycleState(cycle.id,"cancelled",{
   reason:"Development session cancelled."
  });
 }
 if(session.status==="failed"){
  return setDevelopmentCycleState(cycle.id,"failed",{
   reason:"Development session reached a terminal failed state."
  });
 }
 return getActiveDevelopmentCycle(sessionId)!;
}
export function beginDevelopmentContinuation(sessionId:string,reason:string){
 const session=getDevelopmentSession(sessionId);
 if(!session)throw new Error(`Development session not found: ${sessionId}`);
 const active=getActiveDevelopmentCycle(sessionId);
 if(active){
  setDevelopmentCycleState(active.id,"continued",{reason});
 }
 return createDevelopmentCycle({
  sessionId,
  projectId:session.projectId,
  goalId:session.goalId,
  workItemIds:unfinishedWork(session.goalId),
  reason
 });
}
export function developmentCycleSnapshot(sessionId:string){
 return{
  active:getActiveDevelopmentCycle(sessionId),
  latest:getLatestDevelopmentCycle(sessionId),
  cycles:listDevelopmentCycles(sessionId)
 };
}
