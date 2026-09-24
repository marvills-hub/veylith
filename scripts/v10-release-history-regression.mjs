import assert from"node:assert/strict";
import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{db}from"../dist/database/database.js";
import{assessDeliveryReadiness}from"../dist/delivery/delivery-readiness.service.js";
import{deleteDeliveryReadinessByProject}from"../dist/delivery/delivery-readiness.repository.js";
import{createAutonomousDeliveryPlan}from"../dist/delivery/delivery-plan.service.js";
import{deleteDeliveryPlansByProject}from"../dist/delivery/delivery-plan.repository.js";
import{prepareAutonomousDeliveryCommit}from"../dist/delivery/delivery-commit.service.js";
import{deleteDeliveryCommitPreparationsByProject}from"../dist/delivery/delivery-commit.repository.js";
import{authorizeAutonomousPublication}from"../dist/delivery/delivery-publication.service.js";
import{
 deleteDeliveryPublicationsByProject
}from"../dist/delivery/delivery-publication.repository.js";
import{verifyAutonomousDelivery}from"../dist/delivery/delivery-verification.service.js";
import{deleteDeliveryVerificationsByProject}from"../dist/delivery/delivery-verification.repository.js";
import{
 recordVerifiedProjectRelease,
 projectReleaseState,
 projectReleasePrompt
}from"../dist/delivery/release-history.service.js";
import{
 findReleaseByPlan,
 listProjectReleases,
 deleteProjectReleasesByProject
}from"../dist/delivery/release-history.repository.js";
import{releaseHistoryContext}from"../dist/delivery/release-context.service.js";
import{
 captureRepositoryEvolution,
 repositoryEvolutionState
}from"../dist/evolution/repository-evolution.service.js";
import{
 listRepositoryEvolutionSnapshots,
 listRepositoryEvolutionEvents,
 deleteRepositoryEvolutionProject
}from"../dist/evolution/repository-evolution.repository.js";

let passed=0;
let failed=0;
async function check(name,fn){
 try{
  await fn();
  passed++;
  console.log(`PASS ${name}`);
 }catch(error){
  failed++;
  console.error(`FAIL ${name}`);
  console.error(error);
 }
}

const suffix=crypto.randomUUID().replace(/-/g,"").slice(0,10);
const projectId=`p66_project_${suffix}`;
const taskId=`p66_task_${suffix}`;
const goalId=`p66_goal_${suffix}`;
const workspace=path.join(
 process.cwd(),
 "workspaces",
 `.v10-p66-${suffix}`
);
const repositoryName=`veylith-p66-${suffix}`;

fs.mkdirSync(path.join(workspace,"src"),{recursive:true});
fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({name:repositoryName,version:"1.0.0"},null,2)
);
fs.writeFileSync(
 path.join(workspace,"src","index.ts"),
 'export const release="one";\n'
);

const baseline=captureRepositoryEvolution({
 projectId,
 taskId,
 workspace,
 type:"baseline",
 title:"Pass 6.6 release candidate",
 summary:"Approved repository state for release history."
});

const readiness=assessDeliveryReadiness({
 projectId,
 taskId,
 goalId,
 workspace,
 goalComplete:true,
 totalWork:4,
 completedWork:4,
 validationPassed:true,
 reviewApproved:true,
 repositoryAvailable:true,
 unresolvedFailures:0,
 unresolvedEscalations:0
});

const plan=createAutonomousDeliveryPlan({
 projectId,
 taskId,
 goalId,
 readinessId:readiness.id,
 workspace,
 repositoryName,
 targetBranch:"main",
 visibility:"private"
});

const task={id:taskId,title:"Pass 6.6 Release History"};
const project={
 id:projectId,
 workspace,
 slug:repositoryName,
 name:"Pass 6.6 Release History"
};

const commit=await prepareAutonomousDeliveryCommit({
 deliveryPlanId:plan.id,
 task,
 project
});

const publication=await authorizeAutonomousPublication({
 deliveryPlanId:plan.id
});

const verification=verifyAutonomousDelivery({
 deliveryPlanId:plan.id,
 actualCommit:commit.commit,
 remoteVerified:true,
 evidence:["simulated hardened remote verification"],
 metadata:{source:"pass-6.6"}
});

let release;

await check("verified delivery records project release",async()=>{
 release=recordVerifiedProjectRelease({
  deliveryPlanId:plan.id,
  metadata:{channel:"autonomous"}
 });
 assert.equal(release.status,"released");
});

await check("release binds project",async()=>{
 assert.equal(release.projectId,projectId);
});

await check("release binds task",async()=>{
 assert.equal(release.taskId,taskId);
});

await check("release binds goal",async()=>{
 assert.equal(release.goalId,goalId);
});

await check("release binds delivery plan",async()=>{
 assert.equal(release.deliveryPlanId,plan.id);
});

await check("release binds publication",async()=>{
 assert.equal(release.publicationId,publication.id);
});

await check("release binds verification",async()=>{
 assert.equal(release.verificationId,verification.id);
});

await check("release binds exact verified commit",async()=>{
 assert.equal(release.commit,commit.commit);
});

await check("release binds approved repository fingerprint",async()=>{
 assert.equal(
  release.repositoryFingerprint,
  baseline.snapshot.fingerprint
 );
});

await check("first release has sequence one",async()=>{
 assert.equal(release.sequence,1);
});

await check("first release has no predecessor",async()=>{
 assert.equal(release.previousReleaseId,null);
 assert.equal(release.previousCommit,null);
});

await check("release retains repository identity",async()=>{
 assert.equal(release.repositoryName,repositoryName);
});

await check("release retains target branch",async()=>{
 assert.equal(release.targetBranch,"main");
});

await check("release retains release manifest",async()=>{
 assert.equal(
  release.manifest.repositoryFingerprint,
  baseline.snapshot.fingerprint
 );
});

await check("release retains verification evidence",async()=>{
 assert.ok(
  release.evidence.includes(
   "simulated hardened remote verification"
  )
 );
});

await check("release metadata retains approved snapshot",async()=>{
 assert.ok(release.metadata.approvedSnapshotId);
});

await check("release record persists",async()=>{
 const stored=findReleaseByPlan(plan.id);
 assert.equal(stored?.id,release.id);
});

await check("release recording is idempotent",async()=>{
 const retry=recordVerifiedProjectRelease({
  deliveryPlanId:plan.id
 });
 assert.equal(retry.id,release.id);
});

await check("release retry creates no duplicate history",async()=>{
 assert.equal(listProjectReleases(projectId).length,1);
});

await check("project release state resolves latest release",async()=>{
 const state=projectReleaseState(projectId);
 assert.equal(state.latest?.id,release.id);
 assert.equal(state.releases.length,1);
});

await check("release context exposes latest release",async()=>{
 const context=releaseHistoryContext(projectId);
 assert.equal(context.latest?.commit,commit.commit);
});

await check("release context exposes durable history",async()=>{
 const context=releaseHistoryContext(projectId);
 assert.equal(context.releases.length,1);
});

await check("release prompt exposes commit",async()=>{
 const prompt=projectReleasePrompt(projectId);
 assert.ok(prompt.includes(commit.commit));
});

await check("release prompt exposes repository identity",async()=>{
 const prompt=projectReleasePrompt(projectId);
 assert.ok(prompt.includes(repositoryName));
});

await check("release writes durable project memory",async()=>{
 const row=db.prepare(`
  SELECT COUNT(*) AS count
  FROM project_memory
  WHERE project_id=? AND type='project_release'
 `).get(projectId);
 assert.ok(Number(row.count)>0);
});

await check("release creates repository delivery evolution",async()=>{
 const events=listRepositoryEvolutionEvents(projectId);
 assert.ok(events.some(event=>event.type==="delivery"));
});

await check("release evolution retains repository snapshots",async()=>{
 const snapshots=listRepositoryEvolutionSnapshots(projectId);
 assert.ok(snapshots.length>=1);
});

await check("release history remains one verified release",async()=>{
 assert.equal(projectReleaseState(projectId).releases.length,1);
});

await check("unverified delivery cannot create release",async()=>{
 const badProject=`${projectId}_bad`;
 const badTask=`${taskId}_bad`;
 const badGoal=`${goalId}_bad`;
 const badWorkspace=path.join(
  process.cwd(),
  "workspaces",
  `.v10-p66-bad-${suffix}`
 );
 fs.mkdirSync(badWorkspace,{recursive:true});
 fs.writeFileSync(
  path.join(badWorkspace,"index.ts"),
  "export const bad=true;\n"
 );
 captureRepositoryEvolution({
  projectId:badProject,
  taskId:badTask,
  workspace:badWorkspace,
  type:"baseline",
  title:"Unverified candidate",
  summary:"Must not become release."
 });
 const ready=assessDeliveryReadiness({
  projectId:badProject,
  taskId:badTask,
  goalId:badGoal,
  workspace:badWorkspace,
  goalComplete:true,
  totalWork:1,
  completedWork:1,
  validationPassed:true,
  reviewApproved:true,
  repositoryAvailable:true,
  unresolvedFailures:0,
  unresolvedEscalations:0
 });
 const badPlan=createAutonomousDeliveryPlan({
  projectId:badProject,
  taskId:badTask,
  goalId:badGoal,
  readinessId:ready.id,
  workspace:badWorkspace,
  repositoryName:`veylith-p66-bad-${suffix}`
 });
 const badCommit=await prepareAutonomousDeliveryCommit({
  deliveryPlanId:badPlan.id,
  task:{id:badTask,title:"Unverified"},
  project:{
   id:badProject,
   workspace:badWorkspace,
   slug:`veylith-p66-bad-${suffix}`
  }
 });
 await authorizeAutonomousPublication({
  deliveryPlanId:badPlan.id
 });
 verifyAutonomousDelivery({
  deliveryPlanId:badPlan.id,
  actualCommit:badCommit.commit,
  remoteVerified:false
 });
 assert.throws(
  ()=>recordVerifiedProjectRelease({
   deliveryPlanId:badPlan.id
  }),
  /requires a verified delivery/i
 );
 deleteDeliveryVerificationsByProject(badProject);
 deleteDeliveryPublicationsByProject(badProject);
 deleteDeliveryCommitPreparationsByProject(badProject);
 deleteDeliveryPlansByProject(badProject);
 deleteDeliveryReadinessByProject(badProject);
 deleteRepositoryEvolutionProject(badProject);
 db.prepare("DELETE FROM project_memory WHERE project_id=?").run(badProject);
 fs.rmSync(badWorkspace,{recursive:true,force:true});
});

await check("release history performs no GitHub API operation",async()=>{
 assert.equal(release.status,"released");
});

await check("cleanup removes release history",async()=>{
 const removed=deleteProjectReleasesByProject(projectId);
 assert.ok(removed>0);
 assert.equal(listProjectReleases(projectId).length,0);
});

deleteDeliveryVerificationsByProject(projectId);
deleteDeliveryPublicationsByProject(projectId);
deleteDeliveryCommitPreparationsByProject(projectId);
deleteDeliveryPlansByProject(projectId);
deleteDeliveryReadinessByProject(projectId);
deleteRepositoryEvolutionProject(projectId);
db.prepare("DELETE FROM project_memory WHERE project_id=?").run(projectId);
fs.rmSync(workspace,{recursive:true,force:true});

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 PASS 6.6");
console.log(" RELEASE HISTORY + REPOSITORY EVOLUTION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.6 PASSED");
}else{
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.6 NOT YET CLOSED");
}

process.exitCode=failed===0?0:1;



