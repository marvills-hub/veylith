import{db}from"../database/database.js";
import{synchronizeGoalExecution}from"../team/goal-team-execution.service.js";
import{beginDevelopmentContinuation,synchronizeDevelopmentCycle}from"./development-cycle.service.js";
import{evaluateDevelopmentContinuation}from"./continuation-evaluator.service.js";
import{expandGoalWorkGraph}from"./goal-expansion.service.js";
import type{ContinuationWorkProposal}from"./goal-expansion.types.js";

export function applyDevelopmentContinuation(
 sessionId:string,
 proposals:ContinuationWorkProposal[],
 reason="Additional work required to satisfy the project goal."
){
 const session=db.prepare(`
  SELECT id,project_id,goal_id,status
  FROM development_sessions WHERE id=?
 `).get(sessionId) as any;
 if(!session)throw new Error(`Development session not found: ${sessionId}`);
 if(!["active","paused"].includes(String(session.status)))
  throw new Error(`Development session ${sessionId} is not continuable from ${session.status}.`);
 const before=evaluateDevelopmentContinuation(sessionId);
 if(before.decision==="complete")
  throw new Error("Development goal is already satisfied; continuation is not allowed.");
 const expansion=expandGoalWorkGraph(String(session.goal_id),proposals);
 const execution=synchronizeGoalExecution(String(session.goal_id));
 const cycle=beginDevelopmentContinuation(sessionId,reason);
 const synchronized=synchronizeDevelopmentCycle(sessionId);
 const after=evaluateDevelopmentContinuation(sessionId);
 return{before,expansion,execution,cycle,synchronized,after};
}
