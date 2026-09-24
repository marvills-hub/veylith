import assert from"node:assert/strict";
import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{db}from"../dist/database/database.js";
import{assessDeliveryReadiness}from"../dist/delivery/delivery-readiness.service.js";
import{deleteDeliveryReadinessByProject}from"../dist/delivery/delivery-readiness.repository.js";
import{
 createAutonomousDeliveryPlan,
 autonomousDeliveryPlanState,
 assertDeliveryPlanRepositoryCurrent
}from"../dist/delivery/delivery-plan.service.js";
import{
 getDeliveryPlan,
 listDeliveryPlans,
 setDeliveryPlanStatus,
 deleteDeliveryPlansByProject
}from"../dist/delivery/delivery-plan.repository.js";
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
const projectId=`p62_project_${suffix}`;
const otherProjectId=`p62_other_${suffix}`;
const taskId=`p62_task_${suffix}`;
const goalId=`p62_goal_${suffix}`;
const workspace=path.join(process.cwd(),"workspaces",`.v10-p62-${suffix}`);

fs.mkdirSync(path.join(workspace,"src"),{recursive:true});
fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({name:`p62-${suffix}`,version:"1.0.0"},null,2)
);
fs.writeFileSync(
 path.join(workspace,"src","index.ts"),
 'export const release="ready";\n'
);

const baseline=captureRepositoryEvolution({
 projectId,
 taskId,
 workspace,
 type:"baseline",
 title:"Pass 6.2 baseline",
 summary:"Repository baseline for delivery planning."
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
 unresolvedEscalations:0,
 evidence:["all deterministic delivery gates passed"]
});

let plan;

await check("ready project creates autonomous delivery plan",async()=>{
 plan=createAutonomousDeliveryPlan({
  projectId,
  taskId,
  goalId,
  readinessId:readiness.id,
  workspace,
  repositoryName:`veylith-p62-${suffix}`,
  evidence:["release candidate approved"],
  metadata:{source:"pass-6.2-regression"}
 });
 assert.equal(plan.status,"planned");
});

await check("delivery plan binds readiness assessment",async()=>{
 assert.equal(plan.readinessId,readiness.id);
});

await check("release manifest binds project",async()=>{
 assert.equal(plan.manifest.projectId,projectId);
});

await check("release manifest binds goal and task",async()=>{
 assert.equal(plan.manifest.goalId,goalId);
 assert.equal(plan.manifest.taskId,taskId);
});

await check("release manifest binds exact repository fingerprint",async()=>{
 assert.equal(
  plan.manifest.repositoryFingerprint,
  baseline.snapshot.fingerprint
 );
});

await check("release manifest captures repository files",async()=>{
 assert.ok(
  plan.manifest.repositoryFiles.includes("src/index.ts")
 );
 assert.ok(
  plan.manifest.repositoryFiles.includes("package.json")
 );
});

await check("default delivery branch is main",async()=>{
 assert.equal(plan.manifest.targetBranch,"main");
});

await check("delivery visibility is persisted",async()=>{
 assert.ok(
  plan.manifest.visibility==="private"||
  plan.manifest.visibility==="public"
 );
});

await check("delivery plan contains five ordered stages",async()=>{
 assert.deepEqual(
  plan.manifest.stages.map(item=>item.key),
  ["prepare","commit","repository","push","verify"]
 );
 assert.deepEqual(
  plan.manifest.stages.map(item=>item.sequence),
  [1,2,3,4,5]
 );
});

await check("all release stages are required",async()=>{
 assert.ok(plan.manifest.stages.every(item=>item.required));
});

await check("release manifest contains readiness evidence",async()=>{
 assert.ok(
  plan.manifest.evidence.includes(`readiness:${readiness.id}`)
 );
});

await check("release manifest contains repository evidence",async()=>{
 assert.ok(
  plan.manifest.evidence.includes(
   `repository:${baseline.snapshot.fingerprint}`
  )
 );
});

await check("release manifest retains caller evidence",async()=>{
 assert.ok(
  plan.manifest.evidence.includes("release candidate approved")
 );
});

await check("release manifest retains metadata",async()=>{
 assert.equal(
  plan.manifest.metadata.source,
  "pass-6.2-regression"
 );
});

await check("release manifest stores evolution snapshot identity",async()=>{
 assert.equal(
  plan.manifest.metadata.snapshotId,
  baseline.snapshot.id
 );
});

await check("delivery plan persists",async()=>{
 const stored=getDeliveryPlan(plan.id);
 assert.equal(stored?.id,plan.id);
 assert.equal(
  stored?.manifest.repositoryFingerprint,
  plan.manifest.repositoryFingerprint
 );
});

await check("same readiness creates no duplicate plan",async()=>{
 const duplicate=createAutonomousDeliveryPlan({
  projectId,
  taskId,
  goalId,
  readinessId:readiness.id,
  workspace,
  repositoryName:`veylith-p62-${suffix}`
 });
 assert.equal(duplicate.id,plan.id);
 assert.equal(listDeliveryPlans(projectId).length,1);
});

await check("latest delivery plan resolves persisted plan",async()=>{
 const state=autonomousDeliveryPlanState(projectId);
 assert.equal(state?.id,plan.id);
});

await check("planned repository fingerprint is initially current",async()=>{
 const current=assertDeliveryPlanRepositoryCurrent(plan.id);
 assert.equal(current.current,true);
});

await check("blocked readiness cannot create delivery plan",async()=>{
 const blocked=assessDeliveryReadiness({
  projectId,
  taskId,
  goalId,
  workspace,
  goalComplete:true,
  totalWork:5,
  completedWork:5,
  validationPassed:false,
  reviewApproved:true,
  repositoryAvailable:true,
  unresolvedFailures:0,
  unresolvedEscalations:0
 });
 assert.throws(
  ()=>createAutonomousDeliveryPlan({
   projectId,
   taskId,
   goalId,
   readinessId:blocked.id,
   workspace,
   repositoryName:`blocked-${suffix}`
  }),
  /blocked readiness/i
 );
});

await check("cross-project readiness binding is rejected",async()=>{
 assert.throws(
  ()=>createAutonomousDeliveryPlan({
   projectId:otherProjectId,
   taskId,
   goalId,
   readinessId:readiness.id,
   workspace,
   repositoryName:`other-${suffix}`
  }),
  /another project/i
 );
});

await check("workspace mismatch is rejected",async()=>{
 assert.throws(
  ()=>createAutonomousDeliveryPlan({
   projectId,
   taskId,
   goalId,
   readinessId:readiness.id,
   workspace:path.join(workspace,"other"),
   repositoryName:`other-${suffix}`
  }),
  /workspace/i
 );
});

await check("invalid repository name is rejected",async()=>{
 const second=assessDeliveryReadiness({
  projectId,
  taskId:`${taskId}_2`,
  goalId,
  workspace,
  goalComplete:true,
  totalWork:1,
  completedWork:1,
  validationPassed:true,
  reviewApproved:true,
  repositoryAvailable:true,
  unresolvedFailures:0,
  unresolvedEscalations:0
 });
 assert.throws(
  ()=>createAutonomousDeliveryPlan({
   projectId,
   taskId:`${taskId}_2`,
   goalId,
   readinessId:second.id,
   workspace,
   repositoryName:"bad repo name"
  }),
  /unsupported characters/i
 );
});

await check("invalid branch is rejected",async()=>{
 const third=assessDeliveryReadiness({
  projectId,
  taskId:`${taskId}_3`,
  goalId,
  workspace,
  goalComplete:true,
  totalWork:1,
  completedWork:1,
  validationPassed:true,
  reviewApproved:true,
  repositoryAvailable:true,
  unresolvedFailures:0,
  unresolvedEscalations:0
 });
 assert.throws(
  ()=>createAutonomousDeliveryPlan({
   projectId,
   taskId:`${taskId}_3`,
   goalId,
   readinessId:third.id,
   workspace,
   repositoryName:`branch-${suffix}`,
   targetBranch:"bad branch"
  }),
  /branch is invalid/i
 );
});

await check("repository mutation invalidates planned fingerprint",async()=>{
 fs.writeFileSync(
  path.join(workspace,"src","index.ts"),
  'export const release="changed-after-plan";\n'
 );
 const evolved=captureRepositoryEvolution({
  projectId,
  taskId,
  workspace,
  type:"implementation",
  title:"Post-plan repository change",
  summary:"Repository changed after delivery planning."
 });
 assert.notEqual(
  evolved.snapshot.fingerprint,
  plan.manifest.repositoryFingerprint
 );
 assert.throws(
  ()=>assertDeliveryPlanRepositoryCurrent(plan.id),
  /repository changed after delivery planning/i
 );
});

await check("delivery plan status can be cancelled",async()=>{
 const cancelled=setDeliveryPlanStatus(plan.id,"cancelled");
 assert.equal(cancelled.status,"cancelled");
});

await check("delivery plan can reach delivered terminal state",async()=>{
 const delivered=setDeliveryPlanStatus(plan.id,"delivered");
 assert.equal(delivered.status,"delivered");
 assert.ok(delivered.deliveredAt);
});

await check("delivered plan cannot return to planned",async()=>{
 assert.throws(
  ()=>setDeliveryPlanStatus(plan.id,"planned"),
  /terminal/i
 );
});

await check("delivery plan writes durable project memory",async()=>{
 const row=db.prepare(`
  SELECT COUNT(*) AS count
  FROM project_memory
  WHERE project_id=? AND type='delivery_plan'
 `).get(projectId);
 assert.ok(Number(row.count)>0);
});

await check("delivery plan survives service boundary through persistence",async()=>{
 const stored=listDeliveryPlans(projectId);
 const target=stored.find(item=>item.id===plan.id);
 assert.equal(target?.manifest.repositoryName,`veylith-p62-${suffix}`);
 assert.equal(target?.status,"delivered");
});

await check("delivery planning executes no Git publication",async()=>{
 const publication=db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type='table' AND name='git_publication_state'
 `).get();
 if(publication){
  const columns=db.prepare(`
   PRAGMA table_info(git_publication_state)
  `).all();
  const projectColumn=columns.find(column=>
   ["project_id","projectId"].includes(String(column.name))
  );
  if(projectColumn){
   const count=db.prepare(
    `SELECT COUNT(*) AS count FROM git_publication_state WHERE ${projectColumn.name}=?`
   ).get(projectId);
   assert.equal(Number(count.count),0);
  }
 }
 assert.equal(true,true);
});

await check("cleanup removes delivery plans",async()=>{
 const removed=deleteDeliveryPlansByProject(projectId);
 assert.ok(removed>0);
 assert.equal(listDeliveryPlans(projectId).length,0);
});

deleteDeliveryPlansByProject(otherProjectId);
deleteDeliveryReadinessByProject(projectId);
deleteDeliveryReadinessByProject(otherProjectId);
deleteRepositoryEvolutionProject(projectId);
deleteRepositoryEvolutionProject(otherProjectId);
db.prepare(`
 DELETE FROM project_memory
 WHERE project_id IN (?,?)
`).run(projectId,otherProjectId);
fs.rmSync(workspace,{recursive:true,force:true});

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 PASS 6.2");
console.log(" DELIVERY PLAN + RELEASE MANIFEST");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.2 PASSED");
}else{
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.2 NOT YET CLOSED");
}

process.exitCode=failed===0?0:1;
