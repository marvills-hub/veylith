import assert from"node:assert/strict";
import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{simpleGit}from"simple-git";
import{db}from"../dist/database/database.js";
import{assessDeliveryReadiness}from"../dist/delivery/delivery-readiness.service.js";
import{deleteDeliveryReadinessByProject}from"../dist/delivery/delivery-readiness.repository.js";
import{createAutonomousDeliveryPlan}from"../dist/delivery/delivery-plan.service.js";
import{deleteDeliveryPlansByProject}from"../dist/delivery/delivery-plan.repository.js";
import{prepareAutonomousDeliveryCommit}from"../dist/delivery/delivery-commit.service.js";
import{deleteDeliveryCommitPreparationsByProject}from"../dist/delivery/delivery-commit.repository.js";
import{
 authorizeAutonomousPublication,
 assertPublicationAuthorizationCurrent,
 autonomousPublicationState
}from"../dist/delivery/delivery-publication.service.js";
import{
 findDeliveryPublicationByPlan,
 listDeliveryPublications,
 deleteDeliveryPublicationsByProject
}from"../dist/delivery/delivery-publication.repository.js";
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
const projectId=`p64_project_${suffix}`;
const taskId=`p64_task_${suffix}`;
const goalId=`p64_goal_${suffix}`;
const workspace=path.join(
 process.cwd(),
 "workspaces",
 `.v10-p64-${suffix}`
);
const repositoryName=`veylith-p64-${suffix}`;

fs.mkdirSync(path.join(workspace,"src"),{recursive:true});
fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({
  name:repositoryName,
  version:"1.0.0"
 },null,2)
);
fs.writeFileSync(
 path.join(workspace,"src","index.ts"),
 'export const publication="authorized";\n'
);

const evolution=captureRepositoryEvolution({
 projectId,
 taskId,
 workspace,
 type:"baseline",
 title:"Pass 6.4 publication candidate",
 summary:"Approved repository state for publication authorization."
});

const readiness=assessDeliveryReadiness({
 projectId,
 taskId,
 goalId,
 workspace,
 goalComplete:true,
 totalWork:5,
 completedWork:5,
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

const task={
 id:taskId,
 title:"Pass 6.4 Publication Authorization"
};

const project={
 id:projectId,
 workspace,
 slug:repositoryName,
 name:"Pass 6.4 Publication Authorization",
 summary:"Deterministic publication authorization regression."
};

const commit=await prepareAutonomousDeliveryCommit({
 deliveryPlanId:plan.id,
 task,
 project
});

let publication;

await check("prepared commit can authorize GitHub publication",async()=>{
 publication=await authorizeAutonomousPublication({
  deliveryPlanId:plan.id
 });
 assert.equal(publication.status,"authorized");
});

await check("authorization binds delivery plan",async()=>{
 assert.equal(publication.deliveryPlanId,plan.id);
});

await check("authorization binds commit preparation",async()=>{
 assert.equal(
  publication.commitPreparationId,
  commit.id
 );
});

await check("authorization binds readiness",async()=>{
 assert.equal(publication.readinessId,readiness.id);
});

await check("authorization binds exact prepared commit",async()=>{
 assert.equal(publication.commit,commit.commit);
});

await check("authorization binds approved repository fingerprint",async()=>{
 assert.equal(
  publication.repositoryFingerprint,
  evolution.snapshot.fingerprint
 );
});

await check("authorization binds repository name",async()=>{
 assert.equal(publication.repositoryName,repositoryName);
});

await check("authorization binds target branch",async()=>{
 assert.equal(publication.targetBranch,"main");
});

await check("authorization binds visibility",async()=>{
 assert.equal(publication.visibility,"private");
});

await check("authorization records approved HEAD",async()=>{
 assert.equal(
  publication.metadata.authorizedHead,
  commit.commit
 );
});

await check("authorization persists",async()=>{
 const stored=findDeliveryPublicationByPlan(plan.id);
 assert.equal(stored?.id,publication.id);
 assert.equal(stored?.commit,commit.commit);
});

await check("authorization is idempotent",async()=>{
 const retry=await authorizeAutonomousPublication({
  deliveryPlanId:plan.id
 });
 assert.equal(retry.id,publication.id);
});

await check("authorization retry creates no duplicate row",async()=>{
 assert.equal(
  listDeliveryPublications(projectId).length,
  1
 );
});

await check("publication authorization current assertion passes",async()=>{
 const current=await assertPublicationAuthorizationCurrent(plan.id);
 assert.equal(current.current,true);
 assert.equal(current.publication.commit,commit.commit);
});

await check("project publication state resolves authorization",async()=>{
 const state=autonomousPublicationState(projectId);
 assert.equal(state?.id,publication.id);
});

await check("publication authorization writes durable memory",async()=>{
 const row=db.prepare(`
  SELECT COUNT(*) AS count
  FROM project_memory
  WHERE project_id=?
   AND type='delivery_publication_authorized'
 `).get(projectId);
 assert.ok(Number(row.count)>0);
});

await check("authorization creates no Git remote",async()=>{
 const remotes=await simpleGit(workspace).getRemotes(true);
 assert.equal(remotes.length,0);
});

await check("authorization performs no GitHub publication",async()=>{
 assert.equal(publication.github,null);
 assert.equal(publication.publishedAt,null);
 assert.equal(publication.status,"authorized");
});

await check("authorization does not mark delivery plan delivered",async()=>{
 const row=db.prepare(`
  SELECT status
  FROM delivery_plans
  WHERE id=?
 `).get(plan.id);
 assert.equal(row.status,"planned");
});

await check("repository remains clean after authorization",async()=>{
 const status=await simpleGit(workspace).status();
 assert.equal(status.files.length,0);
});

await check("repository HEAD remains prepared commit",async()=>{
 const head=(await simpleGit(workspace).revparse(["HEAD"])).trim();
 assert.equal(head,commit.commit);
});

await check("post-authorization mutation blocks publication authority",async()=>{
 fs.writeFileSync(
  path.join(workspace,"src","mutation.ts"),
  "export const mutation=true;\n"
 );
 await assert.rejects(
  ()=>assertPublicationAuthorizationCurrent(plan.id),
  /changed after delivery commit preparation/i
 );
});

await check("publication remains unpublished after mutation",async()=>{
 const stored=findDeliveryPublicationByPlan(plan.id);
 assert.notEqual(stored?.status,"published");
 assert.equal(stored?.github,null);
});

await check("authorization history survives persistence boundary",async()=>{
 const stored=listDeliveryPublications(projectId);
 assert.equal(stored.length,1);
 assert.equal(stored[0].commit,commit.commit);
});

await check("no origin remote exists after entire regression",async()=>{
 const remotes=await simpleGit(workspace).getRemotes(true);
 assert.equal(
  remotes.some(remote=>remote.name==="origin"),
  false
 );
});

await check("cleanup removes publication authorization",async()=>{
 const removed=deleteDeliveryPublicationsByProject(projectId);
 assert.ok(removed>0);
 assert.equal(listDeliveryPublications(projectId).length,0);
});

deleteDeliveryCommitPreparationsByProject(projectId);
deleteDeliveryPlansByProject(projectId);
deleteDeliveryReadinessByProject(projectId);
deleteRepositoryEvolutionProject(projectId);
db.prepare(`
 DELETE FROM project_memory WHERE project_id=?
`).run(projectId);
fs.rmSync(workspace,{recursive:true,force:true});

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 PASS 6.4");
console.log(" AUTONOMOUS GITHUB PUBLICATION INTEGRATION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.4 PASSED");
}else{
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.4 NOT YET CLOSED");
}

process.exitCode=failed===0?0:1;
