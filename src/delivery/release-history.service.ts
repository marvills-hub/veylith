import{memory}from"../database/database.js";
import{event}from"../core/telemetry.js";
import{captureRepositoryEvolution}from"../evolution/repository-evolution.service.js";
import{findRepositoryEvolutionSnapshot}from"../evolution/repository-evolution.repository.js";
import{getDeliveryPlan}from"./delivery-plan.repository.js";
import{findDeliveryPublicationByPlan}from"./delivery-publication.repository.js";
import{deliveryVerificationForPlan}from"./delivery-verification.service.js";
import{
 createProjectRelease,
 findReleaseByPlan,
 latestProjectRelease,
 listProjectReleases,
 setProjectReleaseStatus
}from"./release-history.repository.js";
import type{RecordVerifiedReleaseInput}from"./release-history.types.js";

export function recordVerifiedProjectRelease(
 input:RecordVerifiedReleaseInput
){
 const plan=getDeliveryPlan(input.deliveryPlanId);
 if(!plan){
  throw new Error(`Delivery plan not found: ${input.deliveryPlanId}`);
 }
 const existing=findReleaseByPlan(plan.id);
 if(existing)return existing;
 const publication=findDeliveryPublicationByPlan(plan.id);
 if(!publication){
  throw new Error("Delivery publication does not exist.");
 }
 const verification=deliveryVerificationForPlan(plan.id);
 if(!verification){
  throw new Error("Delivery verification does not exist.");
 }
 if(
  !verification.verified||
  verification.status!=="verified"
 ){
  throw new Error("Project release requires a verified delivery.");
 }
 if(publication.status!=="published"){
  throw new Error("Project release requires a published delivery.");
 }
 if(
  verification.publicationId!==publication.id||
  verification.expectedCommit!==publication.commit||
  verification.actualCommit!==publication.commit
 ){
  throw new Error(
   "Release verification does not match the published commit."
  );
 }
 if(
  publication.repositoryFingerprint!==
  plan.manifest.repositoryFingerprint
 ){
  throw new Error(
   "Published repository fingerprint does not match release manifest."
  );
 }
 const approvedSnapshot=findRepositoryEvolutionSnapshot(
  plan.projectId,
  plan.manifest.repositoryFingerprint
 );
 if(!approvedSnapshot){
  throw new Error(
   "Approved release repository evolution snapshot no longer exists."
  );
 }
 const previous=latestProjectRelease(plan.projectId);
 const sequence=(previous?.sequence||0)+1;
 const release=createProjectRelease({
  projectId:plan.projectId,
  taskId:plan.taskId,
  goalId:plan.goalId,
  deliveryPlanId:plan.id,
  publicationId:publication.id,
  verificationId:verification.id,
  repositoryName:publication.repositoryName,
  targetBranch:publication.targetBranch,
  commit:publication.commit,
  repositoryFingerprint:publication.repositoryFingerprint,
  previousReleaseId:previous?.id||null,
  previousCommit:previous?.commit||null,
  sequence,
  manifest:plan.manifest as unknown as Record<string,unknown>,
  evidence:[
   ...verification.evidence,
   `releaseCommit:${publication.commit}`,
   `repositoryFingerprint:${publication.repositoryFingerprint}`
  ],
  metadata:{
   ...(input.metadata||{}),
   approvedSnapshotId:approvedSnapshot.id,
   verificationAttempts:verification.attempts
  }
 });
 if(previous&&previous.status==="released"){
  setProjectReleaseStatus(previous.id,"superseded");
 }
 captureRepositoryEvolution({
  projectId:plan.projectId,
  taskId:plan.taskId,
  workspace:plan.manifest.workspace,
  type:"delivery",
  title:`Release ${release.sequence}: ${release.repositoryName}`,
  summary:
   `Verified release ${release.commit} published to `+
   `${release.repositoryName}/${release.targetBranch}.`
 });
 memory(
  plan.projectId,
  "project_release",
  JSON.stringify({
   releaseId:release.id,
   sequence:release.sequence,
   deliveryPlanId:plan.id,
   publicationId:publication.id,
   verificationId:verification.id,
   commit:release.commit,
   repositoryFingerprint:release.repositoryFingerprint,
   previousReleaseId:release.previousReleaseId,
   previousCommit:release.previousCommit
  })
 );
 event(
  "delivery.release_recorded",
  `Recorded verified project release ${release.sequence}.`,
  {
   taskId:plan.taskId||undefined,
   projectId:plan.projectId,
   component:"release-history",
   data:{
    releaseId:release.id,
    sequence:release.sequence,
    commit:release.commit,
    repositoryFingerprint:release.repositoryFingerprint
   }
  }
 );
 return release;
}
export function projectReleaseState(projectId:string){
 return{
  latest:latestProjectRelease(projectId),
  releases:listProjectReleases(projectId)
 };
}
export function projectReleasePrompt(projectId:string,limit=5){
 const releases=listProjectReleases(projectId,limit);
 if(!releases.length){
  return"PROJECT RELEASE HISTORY:\nNo verified releases.";
 }
 return[
  "PROJECT RELEASE HISTORY:",
  ...releases.map(release=>
   [
    `Release ${release.sequence}`,
    `Status: ${release.status}`,
    `Commit: ${release.commit}`,
    `Repository: ${release.repositoryName}`,
    `Branch: ${release.targetBranch}`,
    `Repository fingerprint: ${release.repositoryFingerprint}`,
    release.previousCommit
     ?`Previous commit: ${release.previousCommit}`
     :"Previous commit: none"
   ].join("\n")
  )
 ].join("\n\n");
}
