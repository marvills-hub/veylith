import assert from"node:assert/strict";
import crypto from"node:crypto";
import{db}from"../dist/database/database.js";
import{MAX_REPAIR_ATTEMPTS}from"../dist/config/config.js";
import{
 evaluateValidationEscalation,
 enforceValidationEscalation
}from"../dist/validation/escalation/validation-escalation.service.js";
import{
 getValidationEscalation,
 listProjectValidationEscalations,
 resolveValidationEscalation,
 deleteValidationEscalationsByProject
}from"../dist/validation/escalation/validation-escalation.repository.js";

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
const projectId=`p46_project_${suffix}`;
const taskId=`p46_task_${suffix}`;
const workspace=`C:\\VEYLITH\\veylith\\workspaces\\p46-${suffix}`;
const time=new Date().toISOString();

function columns(table){
 return(db.prepare(`PRAGMA table_info(${table})`).all())
  .map(row=>String(row.name));
}

function insertAdaptive(table,values){
 const available=columns(table);
 const selected=Object.keys(values)
  .filter(key=>available.includes(key));

 db.prepare(`
  INSERT INTO ${table}(${selected.join(",")})
  VALUES(${selected.map(()=>"?").join(",")})
 `).run(...selected.map(key=>values[key]));
}

insertAdaptive("projects",{
 id:projectId,
 name:"Pass 4.6 Escalation Fixture",
 slug:`p46-${suffix}`,
 status:"active",
 progress:0,
 workspace,
 phase:"validation",
 created_at:time,
 updated_at:time
});

insertAdaptive("tasks",{
 id:taskId,
 project_id:projectId,
 title:"Escalation fixture",
 prompt:"Exercise autonomous escalation control.",
 status:"running",
 phase:"validation",
 priority:0,
 attempts:1,
 max_attempts:3,
 repair_attempts:0,
 created_at:time,
 updated_at:time
});

function run(
 id,
 fingerprint,
 failureKind="typecheck",
 index=0
){
 const stamp=new Date(Date.now()+index).toISOString();

 insertAdaptive("validation_runs",{
  id,
  project_id:projectId,
  task_id:taskId,
  workspace,
  status:"failed",
  strategy_json:"{}",
  summary:"Synthetic validation failure.",
  created_at:stamp,
  updated_at:stamp,
  started_at:stamp,
  completed_at:stamp
 });

 insertAdaptive("validation_results",{
  id:`result_${id}`,
  run_id:id,
  command_id:"typecheck",
  stage:"typecheck",
  command:"npx",
  args_json:'["tsc","--noEmit"]',
  status:"failed",
  exit_code:1,
  duration_ms:10,
  stdout:"",
  stderr:"synthetic",
  failure_kind:failureKind,
  fingerprint,
  created_at:stamp,
  updated_at:stamp
 });
}

function repair(
 id,
 runId,
 diagnosticId,
 fingerprint,
 attempt,
 status="applied"
){
 insertAdaptive("validation_repair_attempts",{
  id,
  run_id:runId,
  diagnostic_id:diagnosticId,
  project_id:projectId,
  task_id:taskId,
  attempt,
  status,
  fingerprint,
  failure_kind:"typecheck",
  scope:"focused",
  repair_json:"{}",
  files_json:"[]",
  error:null,
  created_at:new Date(Date.now()+attempt).toISOString(),
  updated_at:new Date(Date.now()+attempt).toISOString(),
  completed_at:new Date(Date.now()+attempt).toISOString()
 });
}

function clearEvidence(){
 db.prepare(`
  DELETE FROM repair_verifications
  WHERE project_id=?
 `).run(projectId);

 db.prepare(`
  DELETE FROM validation_repair_attempts
  WHERE project_id=?
 `).run(projectId);

 const runs=db.prepare(`
  SELECT id FROM validation_runs WHERE project_id=?
 `).all(projectId);

 for(const item of runs){
  db.prepare(`
   DELETE FROM validation_results WHERE run_id=?
  `).run(item.id);
 }

 db.prepare(`
  DELETE FROM validation_runs WHERE project_id=?
 `).run(projectId);
}

await check("clean state allows autonomous continuation",async()=>{
 const decision=evaluateValidationEscalation({
  projectId,
  taskId
 });
 assert.equal(decision.action,"continue");
 assert.equal(decision.reason,null);
});

clearEvidence();

const normalRun=`p46_normal_${suffix}`;
run(normalRun,"fp_normal","typecheck",1);
repair(
 `repair_normal_${suffix}`,
 normalRun,
 `diag_normal_${suffix}`,
 "fp_normal",
 1
);

await check("ordinary code failure within budget remains repairable",async()=>{
 const decision=evaluateValidationEscalation({
  projectId,
  taskId
 });
 assert.equal(decision.action,"continue");
 assert.equal(decision.repairAttempts,1);
});

clearEvidence();

const infraRun=`p46_infra_${suffix}`;
run(infraRun,"fp_infra","infrastructure",2);

await check("infrastructure failure blocks source repair",async()=>{
 const decision=evaluateValidationEscalation({
  projectId,
  taskId
 });
 assert.equal(decision.action,"blocked");
 assert.equal(decision.reason,"infrastructure_blocked");
 assert.equal(decision.severity,"blocked");
});

let infraEscalation;

await check("infrastructure block persists escalation evidence",async()=>{
 const result=enforceValidationEscalation({
  projectId,
  taskId
 });
 infraEscalation=result.escalation;
 assert.ok(infraEscalation);
 assert.equal(infraEscalation.reason,"infrastructure_blocked");
 assert.equal(infraEscalation.status,"open");
});

await check("same infrastructure block is idempotent",async()=>{
 const result=enforceValidationEscalation({
  projectId,
  taskId
 });
 assert.equal(result.escalation.id,infraEscalation.id);
});

await check("escalation survives repository reload",async()=>{
 const saved=getValidationEscalation(infraEscalation.id);
 assert.equal(saved.reason,"infrastructure_blocked");
 assert.equal(saved.status,"open");
});

await check("open escalation can be explicitly resolved",async()=>{
 const resolved=resolveValidationEscalation(
  infraEscalation.id
 );
 assert.equal(resolved.status,"resolved");
 assert.ok(resolved.resolvedAt);
});

clearEvidence();

for(let i=1;i<=3;i++){
 run(
  `p46_loop_${i}_${suffix}`,
  "fp_unchanged",
  "typecheck",
  10+i
 );
 if(i<3){
  repair(
   `repair_loop_${i}_${suffix}`,
   `p46_loop_${i}_${suffix}`,
   `diag_loop_${i}_${suffix}`,
   "fp_unchanged",
   i
  );
 }
}

await check("repeated unchanged fingerprint becomes terminal",async()=>{
 const decision=evaluateValidationEscalation({
  projectId,
  taskId
 });
 assert.equal(decision.action,"escalate");
 assert.equal(decision.reason,"unchanged_failure_loop");
 assert.equal(decision.severity,"terminal");
 assert.equal(decision.unchangedFailures,3);
});

await check("unchanged failure escalation persists",async()=>{
 const result=enforceValidationEscalation({
  projectId,
  taskId
 });
 assert.equal(
  result.escalation.reason,
  "unchanged_failure_loop"
 );
 assert.equal(
  result.escalation.unchangedFailures,
  3
 );
});

clearEvidence();

const budgetFingerprint="fp_budget";

for(let i=1;i<=MAX_REPAIR_ATTEMPTS;i++){
 const runId=`p46_budget_${i}_${suffix}`;
 run(
  runId,
  budgetFingerprint,
  "typecheck",
  30+i
 );
 repair(
  `repair_budget_${i}_${suffix}`,
  runId,
  `diag_budget_${i}_${suffix}`,
  budgetFingerprint,
  i
 );
}

await check("repair budget exhaustion becomes terminal",async()=>{
 const decision=evaluateValidationEscalation({
  projectId,
  taskId
 });
 assert.equal(decision.action,"escalate");
 assert.equal(decision.reason,"repair_budget_exhausted");
 assert.equal(decision.severity,"terminal");
 assert.equal(
  decision.repairAttempts,
  MAX_REPAIR_ATTEMPTS
 );
});

await check("repair budget persists across evaluator calls",async()=>{
 const first=enforceValidationEscalation({
  projectId,
  taskId
 });
 const second=enforceValidationEscalation({
  projectId,
  taskId
 });

 assert.equal(
  first.escalation.id,
  second.escalation.id
 );
});

clearEvidence();

const regressionRun=`p46_regression_${suffix}`;
run(
 regressionRun,
 "fp_regression",
 "typecheck",
 60
);

for(let i=1;i<=2;i++){
 insertAdaptive("repair_verifications",{
  id:`verification_regression_${i}_${suffix}`,
  repair_attempt_id:`synthetic_repair_${i}_${suffix}`,
  project_id:projectId,
  task_id:taskId,
  before_run_id:`before_${i}_${suffix}`,
  after_run_id:`after_${i}_${suffix}`,
  status:"regressed",
  original_fingerprint:`old_${i}`,
  original_resolved:1,
  regression_free:0,
  regressions_json:'["lint"]',
  before_passing_json:'["lint"]',
  after_passing_json:"[]",
  after_failures_json:'["fp_lint"]',
  summary:"Synthetic regression.",
  created_at:new Date(Date.now()+70+i).toISOString(),
  updated_at:new Date(Date.now()+70+i).toISOString(),
  completed_at:new Date(Date.now()+70+i).toISOString()
 });
}

await check("repeated repair regressions become terminal",async()=>{
 const decision=evaluateValidationEscalation({
  projectId,
  taskId
 });
 assert.equal(decision.action,"escalate");
 assert.equal(decision.reason,"regression_loop");
 assert.equal(decision.regressions,2);
});

await check("provider outage blocks without consuming repair budget",async()=>{
 clearEvidence();

 const decision=evaluateValidationEscalation({
  projectId,
  taskId,
  providerBlocked:true
 });

 assert.equal(decision.action,"blocked");
 assert.equal(decision.reason,"provider_blocked");
 assert.equal(decision.repairAttempts,0);
});

await check("provider block persists independently",async()=>{
 const result=enforceValidationEscalation({
  projectId,
  taskId,
  providerBlocked:true
 });

 assert.equal(
  result.escalation.reason,
  "provider_blocked"
 );
 assert.equal(
  result.escalation.severity,
  "blocked"
 );
});

await check("validation escalation writes project memory",async()=>{
 const rows=db.prepare(`
  SELECT type
  FROM project_memory
  WHERE project_id=?
 `).all(projectId);

 assert.ok(
  rows.some(row=>
   String(row.type)==="validation_escalation"
  )
 );
});

await check("project escalation history is persistent",async()=>{
 const rows=listProjectValidationEscalations(
  projectId
 );
 assert.ok(rows.length>=4);
});

await check("persistent escalation cleanup succeeds",async()=>{
 deleteValidationEscalationsByProject(projectId);

 assert.equal(
  listProjectValidationEscalations(projectId).length,
  0
 );
});

clearEvidence();
deleteValidationEscalationsByProject(projectId);

db.prepare(`
 DELETE FROM project_memory WHERE project_id=?
`).run(projectId);

db.prepare(`
 DELETE FROM tasks WHERE id=?
`).run(taskId);

db.prepare(`
 DELETE FROM projects WHERE id=?
`).run(projectId);

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 4 PASS 4.6");
console.log(" UNRECOVERABLE FAILURE + ESCALATION CONTROL");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("");
console.log(
 failed===0
 ?"VEYLITH v1.0 BATCH 4 PASS 4.6 PASSED"
 :"VEYLITH v1.0 BATCH 4 PASS 4.6 NOT YET CLOSED"
);

process.exitCode=failed===0?0:1;
