import path from"node:path";
import{memory}from"../database/database.js";
import{now,GITHUB_VISIBILITY}from"../config/config.js";
import{event}from"../core/telemetry.js";
import{getDeliveryReadiness}from"./delivery-readiness.repository.js";
import{
 createDeliveryPlanRecord,
 findDeliveryPlanByReadiness,
 getDeliveryPlan,
 latestDeliveryPlan
}from"./delivery-plan.repository.js";
import{repositoryEvolutionState}from"../evolution/repository-evolution.service.js";
import type{
 CreateDeliveryPlanInput,
 DeliveryPlanStage,
 DeliveryReleaseManifest
}from"./delivery-plan.types.js";

const stages:DeliveryPlanStage[]=[
 {
  key:"prepare",
  sequence:1,
  required:true,
  description:"Verify delivery intent and repository state."
 },
 {
  key:"commit",
  sequence:2,
  required:true,
  description:"Create or reuse the approved local Git commit."
 },
 {
  key:"repository",
  sequence:3,
  required:true,
  description:"Create or recover the target GitHub repository."
 },
 {
  key:"push",
  sequence:4,
  required:true,
  description:"Push the approved commit to the target branch."
 },
 {
  key:"verify",
  sequence:5,
  required:true,
  description:"Verify the published remote commit."
 }
];

function cleanRepositoryName(value:string){
 const name=value.trim();
 if(!name)throw new Error("Delivery plan requires repositoryName.");
 if(!/^[A-Za-z0-9._-]+$/.test(name)){
  throw new Error("Repository name contains unsupported characters.");
 }
 return name;
}
function cleanBranch(value:string|undefined){
 const branch=(value||"main").trim();
 if(!branch)throw new Error("Delivery plan requires target branch.");
 if(
  branch.startsWith("-")||
  branch.startsWith("/")||
  branch.endsWith("/")||
  branch.includes("..")||
  branch.includes(" ")||
  branch.includes("~")||
  branch.includes("^")||
  branch.includes(":")||
  branch.includes("?")||
  branch.includes("*")||
  branch.includes("[")||
  branch.includes("\\")
 ){
  throw new Error("Target branch is invalid.");
 }
 return branch;
}
export function createAutonomousDeliveryPlan(
 input:CreateDeliveryPlanInput
){
 if(!input.projectId.trim()){
  throw new Error("Delivery plan requires projectId.");
 }
 if(!input.readinessId.trim()){
  throw new Error("Delivery plan requires readinessId.");
 }
 if(!input.workspace.trim()){
  throw new Error("Delivery plan requires workspace.");
 }
 const readiness=getDeliveryReadiness(input.readinessId);
 if(!readiness){
  throw new Error(`Delivery readiness not found: ${input.readinessId}`);
 }
 if(readiness.projectId!==input.projectId){
  throw new Error("Delivery readiness belongs to another project.");
 }
 if(!readiness.ready||readiness.status!=="ready"){
  throw new Error("Blocked readiness cannot create a delivery plan.");
 }
 if(path.resolve(readiness.workspace)!==path.resolve(input.workspace)){
  throw new Error("Delivery workspace does not match readiness workspace.");
 }
 if(
  input.goalId&&
  readiness.goalId&&
  input.goalId!==readiness.goalId
 ){
  throw new Error("Delivery goal does not match readiness goal.");
 }
 if(
  input.taskId&&
  readiness.taskId&&
  input.taskId!==readiness.taskId
 ){
  throw new Error("Delivery task does not match readiness task.");
 }
 const existing=findDeliveryPlanByReadiness(input.readinessId);
 if(existing)return existing;
 const evolution=repositoryEvolutionState(input.projectId);
 const snapshot=evolution.latestSnapshot;
 if(!snapshot){
  throw new Error(
   "Delivery planning requires a repository evolution snapshot."
  );
 }
 if(path.resolve(snapshot.workspace)!==path.resolve(input.workspace)){
  throw new Error(
   "Repository evolution snapshot belongs to another workspace."
  );
 }
 const repositoryName=cleanRepositoryName(input.repositoryName);
 const targetBranch=cleanBranch(input.targetBranch);
 const visibility=input.visibility||GITHUB_VISIBILITY;
 const manifest:DeliveryReleaseManifest={
  projectId:input.projectId,
  taskId:input.taskId,
  goalId:input.goalId,
  readinessId:input.readinessId,
  workspace:path.resolve(input.workspace),
  repositoryFingerprint:snapshot.fingerprint,
  repositoryFiles:[...snapshot.files].sort(),
  targetBranch,
  repositoryName,
  visibility,
  stages:stages.map(item=>({...item})),
  evidence:[
   `readiness:${readiness.id}`,
   `repository:${snapshot.fingerprint}`,
   ...(input.evidence||[])
  ],
  metadata:{
   ...(input.metadata||{}),
   snapshotId:snapshot.id,
   snapshotSequence:snapshot.sequence
  },
  generatedAt:now()
 };
 const plan=createDeliveryPlanRecord({
  projectId:input.projectId,
  taskId:input.taskId,
  goalId:input.goalId,
  readinessId:input.readinessId,
  manifest
 });
 memory(
  input.projectId,
  "delivery_plan",
  JSON.stringify({
   deliveryPlanId:plan.id,
   readinessId:plan.readinessId,
   repositoryFingerprint:manifest.repositoryFingerprint,
   repositoryName:manifest.repositoryName,
   targetBranch:manifest.targetBranch,
   visibility:manifest.visibility,
   stages:manifest.stages.map(item=>item.key)
  })
 );
 event(
  "delivery.plan_created",
  `Autonomous delivery planned for ${repositoryName}.`,
  {
   taskId:input.taskId||undefined,
   projectId:input.projectId,
   component:"delivery-planning",
   data:{
    deliveryPlanId:plan.id,
    readinessId:input.readinessId,
    repositoryFingerprint:manifest.repositoryFingerprint,
    targetBranch,
    visibility
   }
  }
 );
 return plan;
}
export function autonomousDeliveryPlanState(projectId:string){
 return latestDeliveryPlan(projectId);
}
export function assertDeliveryPlanRepositoryCurrent(planId:string){
 const plan=getDeliveryPlan(planId);
 if(!plan)throw new Error(`Delivery plan not found: ${planId}`);
 const evolution=repositoryEvolutionState(plan.projectId);
 const current=evolution.latestSnapshot;
 if(!current){
  throw new Error("Current repository evolution state is unavailable.");
 }
 if(current.fingerprint!==plan.manifest.repositoryFingerprint){
  throw new Error(
   "Repository changed after delivery planning; a new readiness assessment and delivery plan are required."
  );
 }
 return{
  current:true,
  plan,
  snapshot:current
 };
}
