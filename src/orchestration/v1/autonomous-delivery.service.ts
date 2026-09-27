import{db}from"../../database/database.js";
import{assertPreDeliveryGoalAuthority}from"./delivery-goal-authority.service.js";
import{listGoalRoleResultRecords}from"../../team/role-results/goal-role-result-read.service.js";
import{deliveryRuntimeAuthority}from"./delivery-runtime-authority.service.js";
import{checkpointAutonomousLifecycle}from"./lifecycle/lifecycle.service.js";
import{assessDeliveryReadiness}from"../../delivery/delivery-readiness.service.js";
import{createAutonomousDeliveryPlan}from"../../delivery/delivery-plan.service.js";
import{prepareAutonomousDeliveryCommit}from"../../delivery/delivery-commit.service.js";
import{executeAutonomousPublication}from"../../delivery/delivery-publication.service.js";
import{verifyAutonomousDelivery}from"../../delivery/delivery-verification.service.js";
import{recordVerifiedProjectRelease}from"../../delivery/release-history.service.js";
import{captureRepositoryEvolution,repositoryEvolutionState}from"../../evolution/repository-evolution.service.js";
import{getProjectGoal}from"../../goals/goal.repository.js";
import{event}from"../../core/telemetry.js";

function project(projectId:string){
 const row=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId) as any;
 if(!row)throw new Error(`Project not found: ${projectId}`);
 return row;
}

function latestSuccessfulEvidence(goalId:string){
 const results=listGoalRoleResultRecords(goalId).filter(item=>item.status==="completed");
 const tester=[...results].reverse().find(item=>item.role==="tester");
 const reviewer=[...results].reverse().find(item=>item.role==="reviewer");
 const validation=tester?.result?.validation??(typeof tester?.result?.success==="boolean"?tester.result:null);
 const review=reviewer?.result?.review??null;
 return{results,tester,reviewer,validation,review};
}

function ensureDeliveryEvolutionSnapshot(input:{
 projectId:string;
 taskId:string;
 goalId:string;
 workspace:string;
 validationEvidenceId:string;
 reviewEvidenceId:string;
}){
 const existing=repositoryEvolutionState(input.projectId).latestSnapshot;
 if(existing)return existing;
 const captured=captureRepositoryEvolution({
  projectId:input.projectId,
  taskId:input.taskId,
  workspace:input.workspace,
  type:"baseline",
  title:"Pre-delivery repository baseline",
  summary:"Captured validated and approved repository state before autonomous delivery.",
  evidence:[
   `goal:${input.goalId}`,
   `validation:${input.validationEvidenceId}`,
   `review:${input.reviewEvidenceId}`
  ],
  metadata:{
   source:"autonomous-delivery-recovery",
   goalId:input.goalId,
   validationApproved:true,
   reviewApproved:true
  }
 });
 return captured.snapshot;
}

export async function executeV1AutonomousDelivery(input:{
 task:any;
 project:any;
 goalId:string;
 deliveryWorkItemId:string;
}){
 const goal=getProjectGoal(input.goalId);
 if(!goal)throw new Error(`Goal not found: ${input.goalId}`);

 const authority=assertPreDeliveryGoalAuthority(goal.id,input.deliveryWorkItemId);
 const evidence=latestSuccessfulEvidence(goal.id);

 if(!evidence.validation?.success){
  throw new Error("Autonomous delivery requires successful validation evidence.");
 }

 if(!evidence.review?.approved){
  throw new Error("Autonomous delivery requires approved review evidence.");
 }

 const runtime=deliveryRuntimeAuthority({
  projectId:input.project.id,
  workspace:input.project.workspace,
  totalWork:authority.total,
  completedWork:authority.completed
 });

 const readiness=assessDeliveryReadiness({
  projectId:input.project.id,
  taskId:input.task.id,
  goalId:goal.id,
  workspace:input.project.workspace,
  goalComplete:authority.ready,
  totalWork:runtime.totalWork,
  completedWork:runtime.completedWork,
  validationPassed:Boolean(evidence.validation.success),
  reviewApproved:Boolean(evidence.review.approved),
  repositoryAvailable:runtime.repositoryAvailable,
  unresolvedFailures:runtime.unresolvedFailures,
  unresolvedEscalations:runtime.unresolvedEscalations,
  evidence:[
   `goal:${goal.id}`,
   `validation:${evidence.tester?.id??"unknown"}`,
   `review:${evidence.reviewer?.id??"unknown"}`
  ],
  metadata:{
   deliveryWorkItemId:input.deliveryWorkItemId,
   unresolvedFailureIds:runtime.failures.map(item=>item.id),
   unresolvedEscalationIds:runtime.escalations.map(item=>item.id)
  }
 });

 if(!readiness.ready){
  throw new Error(`Project is not ready for autonomous delivery: ${readiness.blockers.join(" | ")}`);
 }

 const snapshot=ensureDeliveryEvolutionSnapshot({
  projectId:input.project.id,
  taskId:input.task.id,
  goalId:goal.id,
  workspace:input.project.workspace,
  validationEvidenceId:evidence.tester?.id??"unknown",
  reviewEvidenceId:evidence.reviewer?.id??"unknown"
 });

 if(!snapshot){
  throw new Error("Unable to establish repository evolution snapshot before autonomous delivery.");
 }

 const plan=createAutonomousDeliveryPlan({
  projectId:input.project.id,
  taskId:input.task.id,
  goalId:goal.id,
  readinessId:readiness.id,
  workspace:input.project.workspace,
  repositoryName:input.project.slug,
  targetBranch:input.project.github_branch||"main",
  visibility:"private",
  evidence:[
   `goal:${goal.id}`,
   `validation:${evidence.tester?.id??"unknown"}`,
   `review:${evidence.reviewer?.id??"unknown"}`,
   `repository:${snapshot.id}`
  ],
  metadata:{
   deliveryWorkItemId:input.deliveryWorkItemId,
   repositorySnapshotId:snapshot.id
  }
 });

 checkpointAutonomousLifecycle(goal.id,"delivery",{
  status:"delivering",
  taskId:input.task.id,
  workItemId:input.deliveryWorkItemId,
  deliveryPlanId:plan.id
 });

 const commit=await prepareAutonomousDeliveryCommit({
  deliveryPlanId:plan.id,
  task:input.task,
  project:input.project
 });

 const fresh=project(input.project.id);

 const publication=await executeAutonomousPublication({
  deliveryPlanId:plan.id,
  task:input.task,
  project:fresh
 });

 checkpointAutonomousLifecycle(goal.id,"verification",{
  status:"running",
  taskId:input.task.id,
  workItemId:input.deliveryWorkItemId,
  deliveryPlanId:plan.id,
  publicationId:publication.id
 });

 const github=publication.github;
 if(!github?.verified||!github?.commit){
  throw new Error("GitHub publication completed without verified remote commit evidence.");
 }

 const verification=verifyAutonomousDelivery({
  deliveryPlanId:plan.id,
  remoteVerified:Boolean(github.verified),
  actualCommit:String(github.commit)
 });

 if(!verification.verified||verification.status!=="verified"){
  throw new Error(`Autonomous delivery verification failed: ${verification.error??verification.status}`);
 }

 checkpointAutonomousLifecycle(goal.id,"release",{
  status:"running",
  taskId:input.task.id,
  workItemId:input.deliveryWorkItemId,
  deliveryPlanId:plan.id,
  publicationId:publication.id,
  verificationId:verification.id
 });

 const release=recordVerifiedProjectRelease({
  deliveryPlanId:plan.id
 });

 checkpointAutonomousLifecycle(goal.id,"release",{
  status:"running",
  taskId:input.task.id,
  workItemId:input.deliveryWorkItemId,
  deliveryPlanId:plan.id,
  publicationId:publication.id,
  verificationId:verification.id,
  releaseId:release.id
 });

 event("orchestrator.v1_delivery_completed","v1 autonomous delivery completed and verified",{
  taskId:input.task.id,
  projectId:input.project.id,
  component:"v1-orchestration",
  data:{
   goalId:goal.id,
   deliveryPlanId:plan.id,
   commit:verification.actualCommit,
   releaseId:release.id
  }
 });

 return{
  summary:"Veylith v1 autonomous delivery completed and verified.",
  readiness,
  snapshot,
  plan,
  commit,
  publication,
  verification,
  release,
  github
 };
}
