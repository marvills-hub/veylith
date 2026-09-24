import assert from"node:assert/strict";
import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{simpleGit}from"simple-git";
import{db}from"../dist/database/database.js";
import{assessDeliveryReadiness}from"../dist/delivery/delivery-readiness.service.js";
import{deleteDeliveryReadinessByProject}from"../dist/delivery/delivery-readiness.repository.js";
import{
 createAutonomousDeliveryPlan
}from"../dist/delivery/delivery-plan.service.js";
import{
 deleteDeliveryPlansByProject
}from"../dist/delivery/delivery-plan.repository.js";
import{
 prepareAutonomousDeliveryCommit,
 assertPreparedDeliveryCommitCurrent,
 autonomousDeliveryCommitState
}from"../dist/delivery/delivery-commit.service.js";
import{
 findDeliveryCommitByPlan,
 listDeliveryCommitPreparations,
 deleteDeliveryCommitPreparationsByProject
}from"../dist/delivery/delivery-commit.repository.js";
import{
 captureRepositoryEvolution
}from"../dist/evolution/repository-evolution.service.js";
import{
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
const projectId=`p63_project_${suffix}`;
const taskId=`p63_task_${suffix}`;
const goalId=`p63_goal_${suffix}`;
const workspace=path.join(
 process.cwd(),
 "workspaces",
 `.v10-p63-${suffix}`
);

fs.mkdirSync(path.join(workspace,"src"),{recursive:true});
fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({
  name:`p63-${suffix}`,
  version:"1.0.0"
 },null,2)
);
fs.writeFileSync(
 path.join(workspace,"src","index.ts"),
 'export const delivery="approved";\n'
);

const evolution=captureRepositoryEvolution({
 projectId,
 taskId,
 workspace,
 type:"baseline",
 title:"Pass 6.3 approved repository",
 summary:"Repository state approved for local delivery commit."
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
 repositoryName:`veylith-p63-${suffix}`,
 targetBranch:"main",
 visibility:"private"
});

const task={
 id:taskId,
 title:"Pass 6.3 Local Delivery"
};

const project={
 id:projectId,
 workspace,
 slug:`veylith-p63-${suffix}`,
 name:"Pass 6.3 Local Delivery",
 summary:"Local commit regression."
};

let preparation;

await check("approved manifest prepares local Git commit",async()=>{
 preparation=await prepareAutonomousDeliveryCommit({
  deliveryPlanId:plan.id,
  task,
  project
 });
 assert.ok(preparation.commit);
 assert.equal(preparation.status,"prepared");
});

await check("commit preparation binds delivery plan",async()=>{
 assert.equal(preparation.deliveryPlanId,plan.id);
});

await check("commit preparation binds readiness",async()=>{
 assert.equal(preparation.readinessId,readiness.id);
});

await check("commit preparation binds approved fingerprint",async()=>{
 assert.equal(
  preparation.repositoryFingerprint,
  evolution.snapshot.fingerprint
 );
});

await check("local Git repository is initialized",async()=>{
 assert.ok(fs.existsSync(path.join(workspace,".git")));
});

await check("prepared commit equals repository HEAD",async()=>{
 const git=simpleGit(workspace);
 const head=(await git.revparse(["HEAD"])).trim();
 assert.equal(head,preparation.commit);
});

await check("initial delivery preparation creates commit",async()=>{
 assert.equal(preparation.created,true);
});

await check("prepared repository is clean",async()=>{
 const status=await simpleGit(workspace).status();
 assert.equal(status.files.length,0);
});

await check("prepared commit is persisted",async()=>{
 const stored=findDeliveryCommitByPlan(plan.id);
 assert.equal(stored?.commit,preparation.commit);
});

await check("prepared commit records local change count",async()=>{
 assert.ok(preparation.changedFiles>0);
});

await check("prepared commit retains repository identity",async()=>{
 assert.equal(
  preparation.metadata.repositoryName,
  `veylith-p63-${suffix}`
 );
});

await check("prepared commit retains target branch",async()=>{
 assert.equal(preparation.metadata.targetBranch,"main");
});

await check("prepared commit retains visibility intent",async()=>{
 assert.equal(preparation.metadata.visibility,"private");
});

await check("prepared commit current assertion succeeds",async()=>{
 const current=await assertPreparedDeliveryCommitCurrent(plan.id);
 assert.equal(current.current,true);
 assert.equal(current.head,preparation.commit);
});

await check("retry is idempotent and reuses same preparation",async()=>{
 const retry=await prepareAutonomousDeliveryCommit({
  deliveryPlanId:plan.id,
  task,
  project
 });
 assert.equal(retry.id,preparation.id);
 assert.equal(retry.commit,preparation.commit);
});

await check("retry creates no duplicate commit",async()=>{
 const git=simpleGit(workspace);
 const log=await git.log();
 assert.equal(log.total,1);
});

await check("retry creates no duplicate preparation row",async()=>{
 assert.equal(
  listDeliveryCommitPreparations(projectId).length,
  1
 );
});

await check("project commit state resolves latest preparation",async()=>{
 const state=autonomousDeliveryCommitState(projectId);
 assert.equal(state?.id,preparation.id);
});

await check("delivery commit writes durable project memory",async()=>{
 const row=db.prepare(`
  SELECT COUNT(*) AS count
  FROM project_memory
  WHERE project_id=? AND type='delivery_commit'
 `).get(projectId);
 assert.ok(Number(row.count)>0);
});

await check("no Git remote is configured",async()=>{
 const remotes=await simpleGit(workspace).getRemotes(true);
 assert.equal(remotes.length,0);
});

await check("repository mutation after preparation is detected",async()=>{
 fs.writeFileSync(
  path.join(workspace,"src","after-commit.ts"),
  "export const changed=true;\n"
 );
 await assert.rejects(
  ()=>assertPreparedDeliveryCommitCurrent(plan.id),
  /changed after delivery commit preparation/i
 );
});

await check("mutated preparation becomes invalidated",async()=>{
 const stored=findDeliveryCommitByPlan(plan.id);
 assert.equal(stored?.status,"invalidated");
});

await check("invalidated preparation cannot silently retry",async()=>{
 await assert.rejects(
  ()=>prepareAutonomousDeliveryCommit({
   deliveryPlanId:plan.id,
   task,
   project
  }),
  /no longer matches/i
 );
});

await check("wrong project is rejected before commit",async()=>{
 const otherWorkspace=path.join(
  process.cwd(),
  "workspaces",
  `.v10-p63-other-${suffix}`
 );
 fs.mkdirSync(otherWorkspace,{recursive:true});
 await assert.rejects(
  ()=>prepareAutonomousDeliveryCommit({
   deliveryPlanId:plan.id,
   task,
   project:{
    ...project,
    id:`other_${projectId}`,
    workspace:otherWorkspace
   }
  }),
  /another project/i
 );
 fs.rmSync(otherWorkspace,{recursive:true,force:true});
});

await check("wrong task is rejected before commit",async()=>{
 await assert.rejects(
  ()=>prepareAutonomousDeliveryCommit({
   deliveryPlanId:plan.id,
   task:{
    id:`other_${taskId}`,
    title:"Wrong task"
   },
   project
  }),
  /task does not match/i
 );
});

await check("commit preparation survives persistence boundary",async()=>{
 const stored=listDeliveryCommitPreparations(projectId);
 assert.equal(stored.length,1);
 assert.equal(stored[0].commit,preparation.commit);
 assert.equal(stored[0].status,"invalidated");
});

await check("commit preparation performs no GitHub publication",async()=>{
 const remotes=await simpleGit(workspace).getRemotes(true);
 assert.equal(remotes.length,0);
 assert.equal(true,true);
});

await check("cleanup removes commit preparation state",async()=>{
 const removed=deleteDeliveryCommitPreparationsByProject(projectId);
 assert.ok(removed>0);
 assert.equal(listDeliveryCommitPreparations(projectId).length,0);
});

deleteDeliveryPlansByProject(projectId);
deleteDeliveryReadinessByProject(projectId);
deleteRepositoryEvolutionProject(projectId);
db.prepare(`
 DELETE FROM project_memory WHERE project_id=?
`).run(projectId);
fs.rmSync(workspace,{recursive:true,force:true});

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 PASS 6.3");
console.log(" SAFE AUTONOMOUS COMMIT PREPARATION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.3 PASSED");
}else{
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.3 NOT YET CLOSED");
}

process.exitCode=failed===0?0:1;
