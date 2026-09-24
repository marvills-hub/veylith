import{memory}from"../database/database.js";
import{event}from"../core/telemetry.js";
import{getPublicationRecoveryState}from"../git/git.service.js";
import{getDeliveryPlan,setDeliveryPlanStatus}from"./delivery-plan.repository.js";
import{
 findDeliveryPublicationByPlan,
 updateDeliveryPublication
}from"./delivery-publication.repository.js";
import{
 ensureDeliveryVerification,
 findDeliveryVerificationByPlan,
 latestDeliveryVerification,
 updateDeliveryVerification
}from"./delivery-verification.repository.js";
import type{
 RecoverDeliveryInput,
 VerifyDeliveryInput
}from"./delivery-verification.types.js";

function normalizeCommit(value:string|null|undefined){
 return value?.trim().toLowerCase()||null;
}
export function verifyAutonomousDelivery(input:VerifyDeliveryInput){
 const plan=getDeliveryPlan(input.deliveryPlanId);
 if(!plan){
  throw new Error(`Delivery plan not found: ${input.deliveryPlanId}`);
 }
 const publication=findDeliveryPublicationByPlan(plan.id);
 if(!publication){
  throw new Error("Delivery publication does not exist.");
 }
 const verification=ensureDeliveryVerification({
  projectId:plan.projectId,
  taskId:plan.taskId,
  goalId:plan.goalId,
  deliveryPlanId:plan.id,
  publicationId:publication.id,
  expectedCommit:publication.commit,
  repositoryName:publication.repositoryName,
  targetBranch:publication.targetBranch
 });
 if(verification.verified){
  if(
   normalizeCommit(verification.actualCommit)!==
   normalizeCommit(publication.commit)
  ){
   throw new Error("Persisted verified delivery contains a commit mismatch.");
  }
  return verification;
 }
 const expected=normalizeCommit(publication.commit);
 const actual=normalizeCommit(input.actualCommit);
 const evidence=[
  ...(input.evidence||[]),
  `expected:${publication.commit}`,
  `actual:${input.actualCommit||"unavailable"}`,
  `remoteVerified:${input.remoteVerified}`
 ];
 if(!input.remoteVerified){
  const failed=updateDeliveryVerification(verification.id,{
   actualCommit:input.actualCommit,
   status:"failed",
   verified:false,
   recoveryAction:"resume_publication",
   incrementAttempts:true,
   error:"Remote publication has not been verified.",
   evidence,
   metadata:input.metadata
  });
  event(
   "delivery.verification_failed",
   "Remote publication has not been verified.",
   {
    taskId:plan.taskId||undefined,
    projectId:plan.projectId,
    component:"delivery-verification",
    level:"warn",
    data:{
     deliveryPlanId:plan.id,
     publicationId:publication.id,
     expectedCommit:publication.commit,
     actualCommit:input.actualCommit
    }
   }
  );
  return failed;
 }
 if(!actual||actual!==expected){
  const failed=updateDeliveryVerification(verification.id,{
   actualCommit:input.actualCommit,
   status:"blocked",
   verified:false,
   recoveryAction:"manual",
   incrementAttempts:true,
   error:"Verified remote commit does not match the approved delivery commit.",
   evidence,
   metadata:input.metadata
  });
  event(
   "delivery.verification_mismatch",
   "Remote commit does not match approved delivery commit.",
   {
    taskId:plan.taskId||undefined,
    projectId:plan.projectId,
    component:"delivery-verification",
    level:"error",
    data:{
     deliveryPlanId:plan.id,
     expectedCommit:publication.commit,
     actualCommit:input.actualCommit
    }
   }
  );
  return failed;
 }
 const verified=updateDeliveryVerification(verification.id,{
  actualCommit:input.actualCommit,
  status:"verified",
  verified:true,
  recoveryAction:"none",
  incrementAttempts:true,
  error:null,
  evidence,
  metadata:input.metadata
 });
 setDeliveryPlanStatus(plan.id,"delivered");
 if(publication.status!=="published"){
  updateDeliveryPublication(publication.id,{
   status:"published",
   error:null,
   metadata:{
    verifiedCommit:publication.commit,
    verificationId:verified.id
   }
  });
 }
 memory(
  plan.projectId,
  "delivery_verified",
  JSON.stringify({
   verificationId:verified.id,
   publicationId:publication.id,
   deliveryPlanId:plan.id,
   commit:verified.actualCommit,
   repositoryName:verified.repositoryName,
   targetBranch:verified.targetBranch
  })
 );
 event(
  "delivery.verified",
  `Verified autonomous delivery ${verified.actualCommit}.`,
  {
   taskId:plan.taskId||undefined,
   projectId:plan.projectId,
   component:"delivery-verification",
   data:{
    verificationId:verified.id,
    publicationId:publication.id,
    deliveryPlanId:plan.id,
    commit:verified.actualCommit
   }
  }
 );
 return verified;
}
export function recoverAutonomousDelivery(input:RecoverDeliveryInput){
 const plan=getDeliveryPlan(input.deliveryPlanId);
 if(!plan){
  throw new Error(`Delivery plan not found: ${input.deliveryPlanId}`);
 }
 const publication=findDeliveryPublicationByPlan(plan.id);
 if(!publication){
  throw new Error("Delivery publication does not exist.");
 }
 const verification=ensureDeliveryVerification({
  projectId:plan.projectId,
  taskId:plan.taskId,
  goalId:plan.goalId,
  deliveryPlanId:plan.id,
  publicationId:publication.id,
  expectedCommit:publication.commit,
  repositoryName:publication.repositoryName,
  targetBranch:publication.targetBranch
 });
 if(verification.verified){
  return{
   action:"none" as const,
   verification,
   publication,
   git:getPublicationRecoveryState(plan.projectId)
  };
 }
 if(verification.status==="blocked"){
  return{
   action:"manual" as const,
   verification,
   publication,
   git:getPublicationRecoveryState(plan.projectId)
  };
 }
 const git=getPublicationRecoveryState(plan.projectId);
 let action:"resume_publication"|"retry_publication";
 if(
  publication.status==="publishing"||
  git?.stage==="repository_ready"||
  git?.stage==="pushed"
 ){
  action="resume_publication";
 }else{
  action="retry_publication";
 }
 const recovering=updateDeliveryVerification(verification.id,{
  status:"recovering",
  verified:false,
  recoveryAction:action,
  error:input.reason||verification.error,
  metadata:{
   recoveryRequested:true,
   publicationStatus:publication.status,
   gitStage:git?.stage||"none"
  }
 });
 memory(
  plan.projectId,
  "delivery_recovery",
  JSON.stringify({
   verificationId:recovering.id,
   publicationId:publication.id,
   deliveryPlanId:plan.id,
   action,
   publicationStatus:publication.status,
   gitStage:git?.stage||"none"
  })
 );
 event(
  "delivery.recovery_requested",
  `Delivery recovery selected ${action}.`,
  {
   taskId:plan.taskId||undefined,
   projectId:plan.projectId,
   component:"delivery-verification",
   level:"warn",
   data:{
    verificationId:recovering.id,
    publicationId:publication.id,
    deliveryPlanId:plan.id,
    action,
    gitStage:git?.stage||"none"
   }
  }
 );
 return{
  action,
  verification:recovering,
  publication,
  git
 };
}
export function deliveryVerificationState(projectId:string){
 return latestDeliveryVerification(projectId);
}
export function deliveryVerificationForPlan(deliveryPlanId:string){
 return findDeliveryVerificationByPlan(deliveryPlanId);
}

