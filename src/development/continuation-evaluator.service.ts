import{db}from"../database/database.js";
import{getDevelopmentSession}from"./development-session.repository.js";
import{getActiveDevelopmentCycle,getLatestDevelopmentCycle,setDevelopmentCycleState}from"./development-cycle.repository.js";
import{ensureDevelopmentCycle}from"./development-cycle.service.js";
import type{ContinuationEvaluation,ContinuationEvidence}from"./continuation.types.js";

function json(value:any){
 try{return JSON.parse(value||"[]");}catch{return[];}
}
function ids(values:any[]){
 return[...new Set(values.filter(value=>typeof value==="string"&&value.length>0))];
}
export function evaluateDevelopmentContinuation(sessionId:string):ContinuationEvaluation{
 const session=getDevelopmentSession(sessionId);
 if(!session)throw new Error(`Development session not found: ${sessionId}`);
 const goal=db.prepare(`
  SELECT id,project_id,status,requirements_json,acceptance_criteria_json
  FROM project_goals WHERE id=?
 `).get(session.goalId) as any;
 if(!goal)throw new Error(`Project goal not found: ${session.goalId}`);

 const work=db.prepare(`
  SELECT id,status,requirement_ids_json,acceptance_ids_json
  FROM goal_work_items
  WHERE goal_id=?
  ORDER BY created_at ASC,id ASC
 `).all(session.goalId) as any[];

 const cycle=getActiveDevelopmentCycle(sessionId)||
  getLatestDevelopmentCycle(sessionId)||
  ensureDevelopmentCycle(sessionId);

 const statuses=work.map(item=>String(item.status));
 const count=(status:string)=>statuses.filter(value=>value===status).length;

 const requirements=json(goal.requirements_json);
 const acceptance=json(goal.acceptance_criteria_json);

 const requirementIds=ids(requirements.map((item:any)=>
  typeof item==="string"?item:item?.id
 ));
 const acceptanceIds=ids(acceptance.map((item:any)=>
  typeof item==="string"?item:item?.id
 ));

 const completed=work.filter(item=>String(item.status)==="completed");
 const coveredRequirements=new Set(
  completed.flatMap(item=>json(item.requirement_ids_json))
 );
 const coveredAcceptance=new Set(
  completed.flatMap(item=>json(item.acceptance_ids_json))
 );

 const uncoveredRequirementIds=requirementIds.filter(id=>!coveredRequirements.has(id));
 const uncoveredAcceptanceIds=acceptanceIds.filter(id=>!coveredAcceptance.has(id));

 const failed=work.filter(item=>String(item.status)==="failed").map(item=>String(item.id));
 const blocked=work.filter(item=>String(item.status)==="blocked").map(item=>String(item.id));
 const runnable=work.filter(item=>["ready","running"].includes(String(item.status))).map(item=>String(item.id));

 const graphTerminal=work.length>0&&work.every(item=>
  ["completed","failed","cancelled","blocked"].includes(String(item.status))
 );

 const goalSatisfied=
  work.length>0&&
  work.every(item=>String(item.status)==="completed")&&
  uncoveredRequirementIds.length===0&&
  uncoveredAcceptanceIds.length===0;

 const needsAdditionalWork=
  uncoveredRequirementIds.length>0||
  uncoveredAcceptanceIds.length>0;

 let decision:ContinuationEvaluation["decision"];
 let reason:string;

 if(goalSatisfied){
  decision="complete";
  reason="All development work, requirements, and acceptance criteria are satisfied.";
 }else if(failed.length>0){
  decision="repair";
  reason="Failed development work requires diagnosis or repair before the goal can complete.";
 }else if(runnable.length>0){
  decision="continue";
  reason="Runnable development work remains in the current goal graph.";
 }else if(needsAdditionalWork){
  decision="continue";
  reason="Goal coverage is incomplete and additional development work is required.";
 }else if(blocked.length>0){
  decision="blocked";
  reason="Remaining development work is blocked with no runnable work available.";
 }else if(!graphTerminal){
  decision="continue";
  reason="Development graph contains unfinished work.";
 }else{
  decision="blocked";
  reason="Development cannot progress from the current graph state.";
 }

 const evidence:ContinuationEvidence={
  totalWork:work.length,
  completedWork:count("completed"),
  failedWork:count("failed"),
  cancelledWork:count("cancelled"),
  blockedWork:count("blocked"),
  runningWork:count("running"),
  readyWork:count("ready"),
  pendingWork:count("pending"),
  uncoveredRequirementIds,
  uncoveredAcceptanceIds,
  failedWorkItemIds:failed,
  blockedWorkItemIds:blocked,
  runnableWorkItemIds:runnable
 };

 return{
  sessionId:session.id,
  projectId:session.projectId,
  goalId:session.goalId,
  cycleId:cycle?.id??null,
  decision,
  reason,
  goalSatisfied,
  graphTerminal,
  needsAdditionalWork,
  evidence,
  evaluatedAt:new Date().toISOString()
 };
}
export function evaluateAndMarkDevelopmentCycle(sessionId:string){
 const evaluation=evaluateDevelopmentContinuation(sessionId);
 if(evaluation.cycleId){
  setDevelopmentCycleState(
   evaluation.cycleId,
   "evaluating",
   {
    reason:evaluation.reason,
    summary:JSON.stringify({
     decision:evaluation.decision,
     goalSatisfied:evaluation.goalSatisfied,
     graphTerminal:evaluation.graphTerminal,
     needsAdditionalWork:evaluation.needsAdditionalWork,
     evidence:evaluation.evidence,
     evaluatedAt:evaluation.evaluatedAt
    })
   }
  );
 }
 return evaluation;
}
