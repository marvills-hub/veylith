import path from"node:path";
import{simpleGit}from"simple-git";
import{memory}from"../database/database.js";
import{event}from"../core/telemetry.js";
import{initializeGit}from"../git/git.service.js";
import{getDeliveryPlan}from"./delivery-plan.repository.js";
import{assertDeliveryPlanRepositoryCurrent}from"./delivery-plan.service.js";
import{
 createDeliveryCommitPreparation,
 findDeliveryCommitByPlan,
 latestDeliveryCommitPreparation,
 setDeliveryCommitStatus
}from"./delivery-commit.repository.js";
import type{
 DeliveryCommitPreparation,
 PrepareDeliveryCommitInput
}from"./delivery-commit.types.js";

async function currentHead(workspace:string){
 const git=simpleGit(workspace);
 try{
  const result=(await git.revparse(["HEAD"])).trim();
  return result||null;
 }catch{
  return null;
 }
}
async function currentStatus(workspace:string){
 const git=simpleGit(workspace);
 return await git.status();
}
export async function prepareAutonomousDeliveryCommit(
 input:PrepareDeliveryCommitInput
):Promise<DeliveryCommitPreparation>{
 const plan=getDeliveryPlan(input.deliveryPlanId);
 if(!plan){
  throw new Error(`Delivery plan not found: ${input.deliveryPlanId}`);
 }
 if(plan.status!=="planned"){
  throw new Error(
   `Delivery plan must be planned before commit preparation; current status is ${plan.status}.`
  );
 }
 if(plan.projectId!==input.project.id){
  throw new Error("Delivery plan belongs to another project.");
 }
 if(
  path.resolve(plan.manifest.workspace)!==
  path.resolve(input.project.workspace)
 ){
  throw new Error("Delivery project workspace does not match release manifest.");
 }
 if(
  plan.taskId&&
  input.task.id&&
  plan.taskId!==input.task.id
 ){
  throw new Error("Delivery task does not match release manifest.");
 }
 const existing=findDeliveryCommitByPlan(plan.id);
 if(existing){
  const head=await currentHead(plan.manifest.workspace);
  if(
   existing.status==="prepared"&&
   head===existing.commit
  ){
   const status=await currentStatus(plan.manifest.workspace);
   if(status.files.length===0)return existing;
  }
  setDeliveryCommitStatus(existing.id,"invalidated");
  throw new Error(
   "Prepared delivery commit no longer matches the current repository HEAD or workspace state."
  );
 }
 assertDeliveryPlanRepositoryCurrent(plan.id);
 const beforeHead=await currentHead(plan.manifest.workspace);
 const result=await initializeGit(input.task,input.project);
 if(!result?.commit){
  throw new Error("Git commit preparation did not produce a repository HEAD.");
 }
 const afterHead=await currentHead(plan.manifest.workspace);
 if(!afterHead||afterHead!==result.commit){
  throw new Error("Prepared Git commit does not match repository HEAD.");
 }
 const status=await currentStatus(plan.manifest.workspace);
 if(status.files.length!==0){
  throw new Error(
   "Repository remained dirty after autonomous commit preparation."
  );
 }
 const preparation=createDeliveryCommitPreparation({
  projectId:plan.projectId,
  taskId:plan.taskId,
  goalId:plan.goalId,
  deliveryPlanId:plan.id,
  readinessId:plan.readinessId,
  workspace:plan.manifest.workspace,
  repositoryFingerprint:plan.manifest.repositoryFingerprint,
  commit:afterHead,
  commitMessage:String(
   result.message||
   `Veylith: complete ${input.task.title}`
  ),
  created:Boolean(result.created),
  changedFiles:Number(result.changedFiles||0),
  metadata:{
   beforeHead,
   afterHead,
   repositoryName:plan.manifest.repositoryName,
   targetBranch:plan.manifest.targetBranch,
   visibility:plan.manifest.visibility
  }
 });
 memory(
  plan.projectId,
  "delivery_commit",
  JSON.stringify({
   deliveryPlanId:plan.id,
   preparationId:preparation.id,
   commit:preparation.commit,
   created:preparation.created,
   changedFiles:preparation.changedFiles,
   repositoryFingerprint:preparation.repositoryFingerprint
  })
 );
 event(
  "delivery.commit_prepared",
  `Prepared autonomous delivery commit ${preparation.commit}.`,
  {
   taskId:plan.taskId||undefined,
   projectId:plan.projectId,
   component:"delivery-commit",
   data:{
    deliveryPlanId:plan.id,
    preparationId:preparation.id,
    commit:preparation.commit,
    created:preparation.created,
    changedFiles:preparation.changedFiles
   }
  }
 );
 return preparation;
}
export async function assertPreparedDeliveryCommitCurrent(
 deliveryPlanId:string
){
 const preparation=findDeliveryCommitByPlan(deliveryPlanId);
 if(!preparation){
  throw new Error(
   `No prepared delivery commit exists for plan: ${deliveryPlanId}`
  );
 }
 if(preparation.status!=="prepared"){
  throw new Error("Delivery commit preparation is invalidated.");
 }
 const head=await currentHead(preparation.workspace);
 if(head!==preparation.commit){
  setDeliveryCommitStatus(preparation.id,"invalidated");
  throw new Error(
   "Prepared delivery commit no longer matches repository HEAD."
  );
 }
 const status=await currentStatus(preparation.workspace);
 if(status.files.length!==0){
  setDeliveryCommitStatus(preparation.id,"invalidated");
  throw new Error(
   "Repository changed after delivery commit preparation."
  );
 }
 return{
  current:true,
  preparation,
  head
 };
}
export function autonomousDeliveryCommitState(projectId:string){
 return latestDeliveryCommitPreparation(projectId);
}
