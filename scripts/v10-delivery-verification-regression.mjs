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
 findDeliveryPublicationByPlan,
 updateDeliveryPublication,
 deleteDeliveryPublicationsByProject
}from"../dist/delivery/delivery-publication.repository.js";
import{
 verifyAutonomousDelivery,
 recoverAutonomousDelivery,
 deliveryVerificationState,
 deliveryVerificationForPlan
}from"../dist/delivery/delivery-verification.service.js";
import{
 listDeliveryVerifications,
 deleteDeliveryVerificationsByProject
}from"../dist/delivery/delivery-verification.repository.js";
import{captureRepositoryEvolution}from"../dist/evolution/repository-evolution.service.js";
import{deleteRepositoryEvolutionProject}from"../dist/evolution/repository-evolution.repository.js";

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
const projectId=`p65_project_${suffix}`;
const taskId=`p65_task_${suffix}`;
const goalId=`p65_goal_${suffix}`;
const workspace=path.join(
 process.cwd(),
 "workspaces",
 `.v10-p65-${suffix}`
);
const repositoryName=`veylith-p65-${suffix}`;

fs.mkdirSync(path.join(workspace,"src"),{recursive:true});
fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({name:repositoryName,version:"1.0.0"},null,2)
);
fs.writeFileSync(
 path.join(workspace,"src","index.ts"),
 'export const verification="candidate";\n'
);

captureRepositoryEvolution({
 projectId,
 taskId,
 workspace,
 type:"baseline",
 title:"Pass 6.5 delivery candidate",
 summary:"Repository candidate for verification regression."
});

const readiness=assessDeliveryReadiness({
 projectId,
 taskId,
 goalId,
 workspace,
 goalComplete:true,
 totalWork:3,
 completedWork:3,
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

const task={id:taskId,title:"Pass 6.5 Delivery Verification"};
const project={
 id:projectId,
 workspace,
 slug:repositoryName,
 name:"Pass 6.5 Delivery Verification",
 summary:"Delivery verification regression."
};

const commit=await prepareAutonomousDeliveryCommit({
 deliveryPlanId:plan.id,
 task,
 project
});

const publication=await authorizeAutonomousPublication({
 deliveryPlanId:plan.id
});

await check("unverified remote produces failed verification",async()=>{
 const result=verifyAutonomousDelivery({
  deliveryPlanId:plan.id,
  actualCommit:null,
  remoteVerified:false,
  evidence:["simulated remote unavailable"]
 });
 assert.equal(result.status,"failed");
 assert.equal(result.verified,false);
});

await check("unverified remote requests publication resume",async()=>{
 const result=deliveryVerificationForPlan(plan.id);
 assert.equal(result?.recoveryAction,"resume_publication");
});

await check("failed verification persists expected commit",async()=>{
 const result=deliveryVerificationForPlan(plan.id);
 assert.equal(result?.expectedCommit,commit.commit);
});

await check("failed verification records attempt",async()=>{
 const result=deliveryVerificationForPlan(plan.id);
 assert.equal(result?.attempts,1);
});

await check("recovery chooses retry for authorized publication",async()=>{
 const result=recoverAutonomousDelivery({
  deliveryPlanId:plan.id,
  reason:"restart after authorization"
 });
 assert.equal(result.action,"retry_publication");
 assert.equal(result.verification.status,"recovering");
});

await check("recovery state survives service boundary",async()=>{
 const state=deliveryVerificationState(projectId);
 assert.equal(state?.deliveryPlanId,plan.id);
 assert.equal(state?.status,"recovering");
});

await check("successful remote SHA verifies delivery",async()=>{
 const result=verifyAutonomousDelivery({
  deliveryPlanId:plan.id,
  actualCommit:commit.commit,
  remoteVerified:true,
  evidence:["simulated hardened GitHub verification"],
  metadata:{source:"pass-6.5-regression"}
 });
 assert.equal(result.status,"verified");
 assert.equal(result.verified,true);
});

await check("verified commit exactly matches prepared SHA",async()=>{
 const result=deliveryVerificationForPlan(plan.id);
 assert.equal(result?.actualCommit,commit.commit);
 assert.equal(result?.expectedCommit,commit.commit);
});

await check("verified delivery clears recovery action",async()=>{
 const result=deliveryVerificationForPlan(plan.id);
 assert.equal(result?.recoveryAction,"none");
});

await check("verified delivery clears error",async()=>{
 const result=deliveryVerificationForPlan(plan.id);
 assert.equal(result?.error,null);
});

await check("verified delivery records verification time",async()=>{
 const result=deliveryVerificationForPlan(plan.id);
 assert.ok(result?.verifiedAt);
});

await check("verification evidence persists",async()=>{
 const result=deliveryVerificationForPlan(plan.id);
 assert.ok(
  result?.evidence.includes(
   "simulated hardened GitHub verification"
  )
 );
});

await check("verification metadata persists",async()=>{
 const result=deliveryVerificationForPlan(plan.id);
 assert.equal(result?.metadata.source,"pass-6.5-regression");
});

await check("successful verification marks publication published",async()=>{
 const result=findDeliveryPublicationByPlan(plan.id);
 assert.equal(result?.status,"published");
});

await check("verified delivery recovery becomes no-op",async()=>{
 const result=recoverAutonomousDelivery({
  deliveryPlanId:plan.id
 });
 assert.equal(result.action,"none");
});

await check("verified delivery is idempotent",async()=>{
 const before=deliveryVerificationForPlan(plan.id);
 const result=verifyAutonomousDelivery({
  deliveryPlanId:plan.id,
  actualCommit:commit.commit,
  remoteVerified:true
 });
 assert.equal(result.id,before.id);
 assert.equal(result.attempts,before.attempts);
});

await check("verification creates one persistent row",async()=>{
 assert.equal(listDeliveryVerifications(projectId).length,1);
});

await check("delivery verification writes durable memory",async()=>{
 const row=db.prepare(`
  SELECT COUNT(*) AS count
  FROM project_memory
  WHERE project_id=? AND type='delivery_verified'
 `).get(projectId);
 assert.ok(Number(row.count)>0);
});

await check("delivery recovery writes durable memory",async()=>{
 const row=db.prepare(`
  SELECT COUNT(*) AS count
  FROM project_memory
  WHERE project_id=? AND type='delivery_recovery'
 `).get(projectId);
 assert.ok(Number(row.count)>0);
});

const mismatchProjectId=`${projectId}_mismatch`;
const mismatchTaskId=`${taskId}_mismatch`;
const mismatchGoalId=`${goalId}_mismatch`;
const mismatchWorkspace=path.join(
 process.cwd(),
 "workspaces",
 `.v10-p65-mismatch-${suffix}`
);
const mismatchRepository=`veylith-p65-mismatch-${suffix}`;

fs.mkdirSync(mismatchWorkspace,{recursive:true});
fs.writeFileSync(
 path.join(mismatchWorkspace,"index.ts"),
 "export const mismatch=true;\n"
);

captureRepositoryEvolution({
 projectId:mismatchProjectId,
 taskId:mismatchTaskId,
 workspace:mismatchWorkspace,
 type:"baseline",
 title:"Mismatch candidate",
 summary:"Mismatch candidate."
});

const mismatchReadiness=assessDeliveryReadiness({
 projectId:mismatchProjectId,
 taskId:mismatchTaskId,
 goalId:mismatchGoalId,
 workspace:mismatchWorkspace,
 goalComplete:true,
 totalWork:1,
 completedWork:1,
 validationPassed:true,
 reviewApproved:true,
 repositoryAvailable:true,
 unresolvedFailures:0,
 unresolvedEscalations:0
});

const mismatchPlan=createAutonomousDeliveryPlan({
 projectId:mismatchProjectId,
 taskId:mismatchTaskId,
 goalId:mismatchGoalId,
 readinessId:mismatchReadiness.id,
 workspace:mismatchWorkspace,
 repositoryName:mismatchRepository
});

const mismatchCommit=await prepareAutonomousDeliveryCommit({
 deliveryPlanId:mismatchPlan.id,
 task:{id:mismatchTaskId,title:"Mismatch"},
 project:{
  id:mismatchProjectId,
  workspace:mismatchWorkspace,
  slug:mismatchRepository
 }
});

await authorizeAutonomousPublication({
 deliveryPlanId:mismatchPlan.id
});

await check("remote SHA mismatch blocks delivery",async()=>{
 const result=verifyAutonomousDelivery({
  deliveryPlanId:mismatchPlan.id,
  actualCommit:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  remoteVerified:true
 });
 assert.equal(result.status,"blocked");
 assert.equal(result.verified,false);
});

await check("remote SHA mismatch requires manual recovery",async()=>{
 const result=deliveryVerificationForPlan(mismatchPlan.id);
 assert.equal(result?.recoveryAction,"manual");
});

await check("blocked mismatch recovery remains manual",async()=>{
 const result=recoverAutonomousDelivery({
  deliveryPlanId:mismatchPlan.id
 });
 assert.equal(result.action,"manual");
});

await check("mismatch preserves approved SHA",async()=>{
 const result=deliveryVerificationForPlan(mismatchPlan.id);
 assert.equal(result?.expectedCommit,mismatchCommit.commit);
 assert.notEqual(result?.actualCommit,mismatchCommit.commit);
});

await check("mismatch does not mark publication published",async()=>{
 const result=findDeliveryPublicationByPlan(mismatchPlan.id);
 assert.notEqual(result?.status,"published");
});

await check("publishing state selects resume recovery",async()=>{
 updateDeliveryPublication(
  findDeliveryPublicationByPlan(mismatchPlan.id).id,
  {status:"publishing"}
 );
 const verification=deliveryVerificationForPlan(mismatchPlan.id);
 db.prepare(`
  UPDATE delivery_verifications
  SET status='failed',recovery_action='resume_publication'
  WHERE id=?
 `).run(verification.id);
 const result=recoverAutonomousDelivery({
  deliveryPlanId:mismatchPlan.id
 });
 assert.equal(result.action,"resume_publication");
});

await check("verification histories remain project isolated",async()=>{
 assert.equal(listDeliveryVerifications(projectId).length,1);
 assert.equal(listDeliveryVerifications(mismatchProjectId).length,1);
});

await check("verification persistence retains repository identity",async()=>{
 const result=deliveryVerificationForPlan(plan.id);
 assert.equal(result?.repositoryName,repositoryName);
 assert.equal(result?.targetBranch,"main");
});

await check("regression executes no live GitHub publication",async()=>{
 const publicationState=findDeliveryPublicationByPlan(plan.id);
 assert.ok(publicationState?.github===null);
 assert.equal(true,true);
});

await check("cleanup removes verification state",async()=>{
 const a=deleteDeliveryVerificationsByProject(projectId);
 const b=deleteDeliveryVerificationsByProject(mismatchProjectId);
 assert.ok(a>0);
 assert.ok(b>0);
});

for(const id of[projectId,mismatchProjectId]){
 deleteDeliveryPublicationsByProject(id);
 deleteDeliveryCommitPreparationsByProject(id);
 deleteDeliveryPlansByProject(id);
 deleteDeliveryReadinessByProject(id);
 deleteRepositoryEvolutionProject(id);
 db.prepare("DELETE FROM project_memory WHERE project_id=?").run(id);
}
fs.rmSync(workspace,{recursive:true,force:true});
fs.rmSync(mismatchWorkspace,{recursive:true,force:true});

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 PASS 6.5");
console.log(" DELIVERY VERIFICATION + RECOVERY");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.5 PASSED");
}else{
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.5 NOT YET CLOSED");
}

process.exitCode=failed===0?0:1;
