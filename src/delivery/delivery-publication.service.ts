import path from"node:path";
import{memory}from"../database/database.js";
import{event}from"../core/telemetry.js";
import{publishToGitHub}from"../git/git.service.js";
import{getDeliveryPlan}from"./delivery-plan.repository.js";
import{
 assertPreparedDeliveryCommitCurrent
}from"./delivery-commit.service.js";
import{
 createDeliveryPublication,
 findDeliveryPublicationByPlan,
 latestDeliveryPublication,
 updateDeliveryPublication
}from"./delivery-publication.repository.js";
import type{
 AuthorizeDeliveryPublicationInput,
 ExecuteDeliveryPublicationInput
}from"./delivery-publication.types.js";

export async function authorizeAutonomousPublication(
 input:AuthorizeDeliveryPublicationInput
){
 const plan=getDeliveryPlan(input.deliveryPlanId);
 if(!plan){
  throw new Error(`Delivery plan not found: ${input.deliveryPlanId}`);
 }
 if(plan.status!=="planned"){
  throw new Error(
   `Delivery plan must be planned before publication; current status is ${plan.status}.`
  );
 }
 const current=await assertPreparedDeliveryCommitCurrent(plan.id);
 const preparation=current.preparation;
 if(preparation.projectId!==plan.projectId){
  throw new Error("Prepared commit belongs to another project.");
 }
 if(preparation.readinessId!==plan.readinessId){
  throw new Error("Prepared commit readiness does not match delivery plan.");
 }
 if(
  preparation.repositoryFingerprint!==
  plan.manifest.repositoryFingerprint
 ){
  throw new Error("Prepared commit fingerprint does not match delivery plan.");
 }
 const existing=findDeliveryPublicationByPlan(plan.id);
 if(existing){
  if(existing.commit!==preparation.commit){
   throw new Error(
    "Existing publication authorization targets another commit."
   );
  }
  if(existing.status==="invalidated"){
   throw new Error("Publication authorization is invalidated.");
  }
  return existing;
 }
 const publication=createDeliveryPublication({
  projectId:plan.projectId,
  taskId:plan.taskId,
  goalId:plan.goalId,
  deliveryPlanId:plan.id,
  commitPreparationId:preparation.id,
  readinessId:plan.readinessId,
  workspace:plan.manifest.workspace,
  repositoryName:plan.manifest.repositoryName,
  targetBranch:plan.manifest.targetBranch,
  visibility:plan.manifest.visibility,
  commit:preparation.commit,
  repositoryFingerprint:plan.manifest.repositoryFingerprint,
  metadata:{
   authorizedHead:current.head,
   releaseGeneratedAt:plan.manifest.generatedAt
  }
 });
 memory(
  plan.projectId,
  "delivery_publication_authorized",
  JSON.stringify({
   publicationId:publication.id,
   deliveryPlanId:plan.id,
   commit:publication.commit,
   repositoryName:publication.repositoryName,
   targetBranch:publication.targetBranch
  })
 );
 event(
  "delivery.publication_authorized",
  `Authorized GitHub publication of ${publication.commit}.`,
  {
   taskId:plan.taskId||undefined,
   projectId:plan.projectId,
   component:"delivery-publication",
   data:{
    publicationId:publication.id,
    deliveryPlanId:plan.id,
    commit:publication.commit,
    repositoryName:publication.repositoryName,
    targetBranch:publication.targetBranch
   }
  }
 );
 return publication;
}

export async function executeAutonomousPublication(
 input:ExecuteDeliveryPublicationInput
){
 const plan=getDeliveryPlan(input.deliveryPlanId);
 if(!plan){
  throw new Error(`Delivery plan not found: ${input.deliveryPlanId}`);
 }
 if(plan.projectId!==input.project.id){
  throw new Error("Delivery plan belongs to another project.");
 }
 if(
  path.resolve(plan.manifest.workspace)!==
  path.resolve(input.project.workspace)
 ){
  throw new Error("Publication workspace does not match delivery plan.");
 }
 if(input.project.slug!==plan.manifest.repositoryName){
  throw new Error(
   "Project repository slug does not match approved delivery repository."
  );
 }
 const publication=await authorizeAutonomousPublication({
  deliveryPlanId:plan.id
 });
 if(publication.status==="published"){
  return publication;
 }
 if(publication.status==="publishing"){
  throw new Error(
   "Delivery publication is already marked as publishing and requires recovery."
  );
 }
 const current=await assertPreparedDeliveryCommitCurrent(plan.id);
 if(current.preparation.commit!==publication.commit){
  updateDeliveryPublication(publication.id,{
   status:"invalidated",
   error:"Prepared commit changed after publication authorization."
  });
  throw new Error(
   "Prepared commit changed after publication authorization."
  );
 }
 updateDeliveryPublication(publication.id,{
  status:"publishing",
  error:null
 });
 try{
  const github=await publishToGitHub(input.task,input.project);
  if(!github){
   const failed=updateDeliveryPublication(publication.id,{
    status:"failed",
    error:"GitHub publishing is not configured or returned no publication result."
   });
   throw new Error(failed.error!);
  }
  const published=updateDeliveryPublication(publication.id,{
   status:"published",
   github:github as Record<string,unknown>,
   error:null,
   metadata:{
    publishedCommit:publication.commit
   }
  });
memory(
   plan.projectId,
   "delivery_publication",
   JSON.stringify({
    publicationId:published.id,
    deliveryPlanId:plan.id,
    commit:published.commit,
    github:published.github
   })
  );
  event(
   "delivery.publication_completed",
   `Autonomous GitHub publication completed for ${published.commit}.`,
   {
    taskId:plan.taskId||undefined,
    projectId:plan.projectId,
    component:"delivery-publication",
    data:{
     publicationId:published.id,
     deliveryPlanId:plan.id,
     commit:published.commit
    }
   }
  );
  return published;
 }catch(error){
  const currentState=findDeliveryPublicationByPlan(plan.id);
  if(currentState?.status==="publishing"){
   updateDeliveryPublication(publication.id,{
    status:"failed",
    error:error instanceof Error?error.message:String(error)
   });
  }
  throw error;
 }
}

export async function assertPublicationAuthorizationCurrent(
 deliveryPlanId:string
){
 const publication=findDeliveryPublicationByPlan(deliveryPlanId);
 if(!publication){
  throw new Error(
   `No publication authorization exists for plan: ${deliveryPlanId}`
  );
 }
 if(
  publication.status==="invalidated"||
  publication.status==="failed"
 ){
  throw new Error(
   `Publication authorization is ${publication.status}.`
  );
 }
 const current=await assertPreparedDeliveryCommitCurrent(deliveryPlanId);
 if(current.preparation.commit!==publication.commit){
  updateDeliveryPublication(publication.id,{
   status:"invalidated",
   error:"Repository commit no longer matches publication authorization."
  });
  throw new Error(
   "Repository commit no longer matches publication authorization."
  );
 }
 return{
  current:true,
  publication,
  preparation:current.preparation
 };
}

export function autonomousPublicationState(projectId:string){
 return latestDeliveryPublication(projectId);
}


