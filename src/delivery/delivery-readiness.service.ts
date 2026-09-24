import fs from"node:fs";
import path from"node:path";
import{memory}from"../database/database.js";
import{event}from"../core/telemetry.js";
import{createDeliveryReadiness,latestDeliveryReadiness}from"./delivery-readiness.repository.js";
import type{DeliveryReadinessCheck,DeliveryReadinessInput}from"./delivery-readiness.types.js";

function check(
 key:DeliveryReadinessCheck["key"],
 passed:boolean,
 success:string,
 failure:string,
 evidence:string[]=[]
):DeliveryReadinessCheck{
 return{
  key,
  status:passed?"passed":"failed",
  summary:passed?success:failure,
  evidence
 };
}
function repositoryExists(workspace:string){
 try{
  const resolved=path.resolve(workspace);
  return fs.existsSync(resolved)&&fs.statSync(resolved).isDirectory();
 }catch{
  return false;
 }
}
export function assessDeliveryReadiness(input:DeliveryReadinessInput){
 if(!input.projectId.trim())throw new Error("Delivery readiness requires projectId.");
 if(!input.workspace.trim())throw new Error("Delivery readiness requires workspace.");
 if(input.totalWork<0||input.completedWork<0){
  throw new Error("Delivery work counts cannot be negative.");
 }
 if(input.completedWork>input.totalWork){
  throw new Error("Completed work cannot exceed total work.");
 }
 const workspaceAvailable=
  input.repositoryAvailable&&repositoryExists(input.workspace);
 const workComplete=
  input.totalWork>0&&input.completedWork===input.totalWork;
 const checks:DeliveryReadinessCheck[]=[
  check(
   "goal_complete",
   input.goalComplete,
   "Project goal is complete.",
   "Project goal is not complete.",
   input.goalId?[`goal:${input.goalId}`]:[]
  ),
  check(
   "work_complete",
   workComplete,
   `All ${input.totalWork} goal work items are complete.`,
   `${input.completedWork}/${input.totalWork} goal work items are complete.`
  ),
  check(
   "validation_passed",
   input.validationPassed,
   "Latest required validation passed.",
   "Required validation has not passed."
  ),
  check(
   "review_approved",
   input.reviewApproved,
   "Latest required review is approved.",
   "Required review has not been approved."
  ),
  check(
   "repository_available",
   workspaceAvailable,
   "Repository workspace is available.",
   "Repository workspace is unavailable."
  ),
  check(
   "unresolved_failures",
   input.unresolvedFailures===0,
   "No unresolved historical failures remain.",
   `${input.unresolvedFailures} unresolved failure${input.unresolvedFailures===1?"":"s"} remain.`
  ),
  check(
   "unresolved_escalations",
   input.unresolvedEscalations===0,
   "No unresolved validation escalations remain.",
   `${input.unresolvedEscalations} unresolved escalation${input.unresolvedEscalations===1?"":"s"} remain.`
  )
 ];
 const blockers=checks
  .filter(item=>item.status==="failed")
  .map(item=>item.summary);
 const ready=blockers.length===0;
 const assessment=createDeliveryReadiness({
  projectId:input.projectId,
  taskId:input.taskId,
  goalId:input.goalId,
  workspace:path.resolve(input.workspace),
  status:ready?"ready":"blocked",
  ready,
  checks,
  blockers,
  evidence:[...(input.evidence||[])],
  metadata:{...(input.metadata||{})}
 });
 memory(
  input.projectId,
  "delivery_readiness",
  JSON.stringify({
   assessmentId:assessment.id,
   goalId:assessment.goalId,
   taskId:assessment.taskId,
   ready:assessment.ready,
   blockers:assessment.blockers,
   checks:assessment.checks.map(item=>({
    key:item.key,
    status:item.status
   }))
  })
 );
 event(
  ready?"delivery.readiness_ready":"delivery.readiness_blocked",
  ready
   ?"Project passed autonomous delivery readiness."
   :`Delivery blocked: ${blockers.join(" | ")}`,
  {
   taskId:input.taskId||undefined,
   projectId:input.projectId,
   level:ready?"info":"warn",
   component:"delivery-readiness",
   data:{
    assessmentId:assessment.id,
    goalId:input.goalId,
    ready,
    blockers
   }
  }
 );
 return assessment;
}
export function assertDeliveryReady(input:DeliveryReadinessInput){
 const assessment=assessDeliveryReadiness(input);
 if(!assessment.ready){
  throw new Error(
   `Project is not ready for autonomous delivery: ${assessment.blockers.join(" | ")}`
  );
 }
 return assessment;
}
export function deliveryReadinessState(projectId:string){
 return latestDeliveryReadiness(projectId);
}
