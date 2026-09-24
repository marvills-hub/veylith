import assert from"node:assert/strict";
import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{db}from"../dist/database/database.js";
import{
 assessDeliveryReadiness,
 assertDeliveryReady,
 deliveryReadinessState
}from"../dist/delivery/delivery-readiness.service.js";
import{
 listDeliveryReadiness,
 deleteDeliveryReadinessByProject
}from"../dist/delivery/delivery-readiness.repository.js";

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
const projectId=`p61_project_${suffix}`;
const otherProjectId=`p61_other_${suffix}`;
const taskId=`p61_task_${suffix}`;
const goalId=`p61_goal_${suffix}`;
const workspace=path.join(
 process.cwd(),
 "workspaces",
 `.v10-p61-${suffix}`
);

fs.mkdirSync(path.join(workspace,"src"),{recursive:true});
fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({
  name:`p61-${suffix}`,
  version:"1.0.0"
 },null,2)
);
fs.writeFileSync(
 path.join(workspace,"src","index.ts"),
 `export const ready=true;\n`
);

const readyInput={
 projectId,
 taskId,
 goalId,
 workspace,
 goalComplete:true,
 totalWork:6,
 completedWork:6,
 validationPassed:true,
 reviewApproved:true,
 repositoryAvailable:true,
 unresolvedFailures:0,
 unresolvedEscalations:0,
 evidence:[
  "goal complete",
  "validation passed",
  "review approved"
 ],
 metadata:{
  source:"pass-6.1-regression"
 }
};

let ready;

await check("complete project becomes delivery ready",async()=>{
 ready=assessDeliveryReadiness(readyInput);
 assert.equal(ready.ready,true);
 assert.equal(ready.status,"ready");
});

await check("readiness evaluates seven deterministic gates",async()=>{
 assert.equal(ready.checks.length,7);
});

await check("ready assessment contains no blockers",async()=>{
 assert.deepEqual(ready.blockers,[]);
});

await check("goal completion gate passes",async()=>{
 assert.equal(
  ready.checks.find(item=>item.key==="goal_complete")?.status,
  "passed"
 );
});

await check("goal work completion gate passes",async()=>{
 assert.equal(
  ready.checks.find(item=>item.key==="work_complete")?.status,
  "passed"
 );
});

await check("validation gate passes",async()=>{
 assert.equal(
  ready.checks.find(item=>item.key==="validation_passed")?.status,
  "passed"
 );
});

await check("review gate passes",async()=>{
 assert.equal(
  ready.checks.find(item=>item.key==="review_approved")?.status,
  "passed"
 );
});

await check("repository availability gate passes",async()=>{
 assert.equal(
  ready.checks.find(item=>item.key==="repository_available")?.status,
  "passed"
 );
});

await check("failure history gate passes",async()=>{
 assert.equal(
  ready.checks.find(item=>item.key==="unresolved_failures")?.status,
  "passed"
 );
});

await check("escalation gate passes",async()=>{
 assert.equal(
  ready.checks.find(item=>item.key==="unresolved_escalations")?.status,
  "passed"
 );
});

await check("ready assessment persists",async()=>{
 const state=deliveryReadinessState(projectId);
 assert.equal(state?.id,ready.id);
 assert.equal(state?.ready,true);
});

await check("ready assessment preserves evidence",async()=>{
 assert.ok(ready.evidence.includes("validation passed"));
 assert.ok(ready.evidence.includes("review approved"));
});

await check("ready assessment preserves metadata",async()=>{
 assert.equal(
  ready.metadata.source,
  "pass-6.1-regression"
 );
});

await check("assertDeliveryReady accepts ready project",async()=>{
 const result=assertDeliveryReady(readyInput);
 assert.equal(result.ready,true);
});

let incomplete;

await check("incomplete goal blocks delivery",async()=>{
 incomplete=assessDeliveryReadiness({
  ...readyInput,
  goalComplete:false
 });
 assert.equal(incomplete.ready,false);
 assert.match(incomplete.blockers.join(" "),/goal is not complete/i);
});

await check("incomplete graph work blocks delivery",async()=>{
 const result=assessDeliveryReadiness({
  ...readyInput,
  completedWork:5
 });
 assert.equal(result.ready,false);
 assert.match(result.blockers.join(" "),/5\/6/);
});

await check("zero work cannot be considered complete",async()=>{
 const result=assessDeliveryReadiness({
  ...readyInput,
  totalWork:0,
  completedWork:0
 });
 assert.equal(result.ready,false);
});

await check("failed validation blocks delivery",async()=>{
 const result=assessDeliveryReadiness({
  ...readyInput,
  validationPassed:false
 });
 assert.equal(result.ready,false);
 assert.match(result.blockers.join(" "),/validation/i);
});

await check("unapproved review blocks delivery",async()=>{
 const result=assessDeliveryReadiness({
  ...readyInput,
  reviewApproved:false
 });
 assert.equal(result.ready,false);
 assert.match(result.blockers.join(" "),/review/i);
});

await check("missing repository blocks delivery",async()=>{
 const result=assessDeliveryReadiness({
  ...readyInput,
  repositoryAvailable:false
 });
 assert.equal(result.ready,false);
 assert.match(result.blockers.join(" "),/repository/i);
});

await check("missing workspace blocks delivery even when caller says available",async()=>{
 const result=assessDeliveryReadiness({
  ...readyInput,
  workspace:path.join(workspace,"does-not-exist")
 });
 assert.equal(result.ready,false);
});

await check("unresolved historical failure blocks delivery",async()=>{
 const result=assessDeliveryReadiness({
  ...readyInput,
  unresolvedFailures:1
 });
 assert.equal(result.ready,false);
 assert.match(result.blockers.join(" "),/unresolved failure/i);
});

await check("unresolved escalation blocks delivery",async()=>{
 const result=assessDeliveryReadiness({
  ...readyInput,
  unresolvedEscalations:2
 });
 assert.equal(result.ready,false);
 assert.match(result.blockers.join(" "),/unresolved escalation/i);
});

await check("multiple blockers remain visible together",async()=>{
 const result=assessDeliveryReadiness({
  ...readyInput,
  goalComplete:false,
  completedWork:4,
  validationPassed:false,
  reviewApproved:false,
  unresolvedFailures:2,
  unresolvedEscalations:1
 });
 assert.ok(result.blockers.length>=6);
});

await check("assertDeliveryReady rejects blocked project",async()=>{
 assert.throws(
  ()=>assertDeliveryReady({
   ...readyInput,
   validationPassed:false
  }),
  /not ready for autonomous delivery/i
 );
});

await check("invalid negative work count is rejected",async()=>{
 assert.throws(
  ()=>assessDeliveryReadiness({
   ...readyInput,
   completedWork:-1
  }),
  /cannot be negative/i
 );
});

await check("completed work cannot exceed graph size",async()=>{
 assert.throws(
  ()=>assessDeliveryReadiness({
   ...readyInput,
   completedWork:7
  }),
  /cannot exceed total work/i
 );
});

await check("project id is required",async()=>{
 assert.throws(
  ()=>assessDeliveryReadiness({
   ...readyInput,
   projectId:""
  }),
  /requires projectId/i
 );
});

await check("workspace is required",async()=>{
 assert.throws(
  ()=>assessDeliveryReadiness({
   ...readyInput,
   workspace:""
  }),
  /requires workspace/i
 );
});

await check("readiness assessments retain history",async()=>{
 const history=listDeliveryReadiness(projectId,100);
 assert.ok(history.length>1);
 assert.ok(history.some(item=>item.ready));
 assert.ok(history.some(item=>!item.ready));
});

await check("latest readiness state reflects latest assessment",async()=>{
 const latest=deliveryReadinessState(projectId);
 assert.ok(latest);
});

await check("delivery readiness writes durable project memory",async()=>{
 const row=db.prepare(`
  SELECT COUNT(*) AS count
  FROM project_memory
  WHERE project_id=? AND type='delivery_readiness'
 `).get(projectId);
 assert.ok(Number(row.count)>0);
});

await check("project readiness histories remain isolated",async()=>{
 assessDeliveryReadiness({
  ...readyInput,
  projectId:otherProjectId,
  taskId:null,
  goalId:null
 });
 const own=listDeliveryReadiness(projectId,100);
 const other=listDeliveryReadiness(otherProjectId,100);
 assert.ok(own.every(item=>item.projectId===projectId));
 assert.ok(other.every(item=>item.projectId===otherProjectId));
});

await check("readiness survives service boundary through persistence",async()=>{
 const stored=listDeliveryReadiness(projectId,100);
 const target=stored.find(item=>item.id===ready.id);
 assert.equal(target?.ready,true);
 assert.equal(target?.checks.length,7);
});

await check("cleanup removes readiness history",async()=>{
 const removed=deleteDeliveryReadinessByProject(projectId);
 assert.ok(removed>0);
 assert.equal(listDeliveryReadiness(projectId,100).length,0);
});

deleteDeliveryReadinessByProject(otherProjectId);
db.prepare(`
 DELETE FROM project_memory
 WHERE project_id IN (?,?)
`).run(projectId,otherProjectId);
fs.rmSync(workspace,{recursive:true,force:true});

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 PASS 6.1");
console.log(" AUTONOMOUS DELIVERY READINESS");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.1 PASSED");
}else{
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 PASS 6.1 NOT YET CLOSED");
}

process.exitCode=failed===0?0:1;
