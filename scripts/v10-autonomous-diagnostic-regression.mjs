import assert from"node:assert/strict";
import crypto from"node:crypto";
import{db}from"../dist/database/database.js";
import{
 createValidationDiagnostic,
 deleteValidationDiagnosticsByRun,
 getRunValidationDiagnostic,
 listFingerprintDiagnostics
}from"../dist/validation/validation-diagnostic.repository.js";
import{
 diagnoseValidationRun,
 validationDiagnosticDecision
}from"../dist/validation/validation-diagnostic.service.js";

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
const projectId=`p43_project_${suffix}`;
const taskId=`p43_task_${suffix}`;
const run1=`p43_run1_${suffix}`;
const run2=`p43_run2_${suffix}`;
const run3=`p43_run3_${suffix}`;
const run4=`p43_run4_${suffix}`;
const time=new Date().toISOString();

db.prepare(`
 INSERT INTO projects(
  id,name,slug,status,progress,workspace,created_at,updated_at,phase
 ) VALUES(?,?,?,'active',0,?,?,?,'validation')
`).run(
 projectId,
 "Pass 4.3 Diagnostic Fixture",
 `p43-${suffix}`,
 `C:\\VEYLITH\\veylith\\workspaces\\p43-${suffix}`,
 time,time
);

db.prepare(`
 INSERT INTO tasks(
  id,project_id,title,prompt,status,phase,priority,attempts,max_attempts,
  created_at,updated_at,repair_attempts
 ) VALUES(?,?,?,?,'running','validation',0,1,3,?,?,0)
`).run(
 taskId,projectId,
 "Diagnose validation failure",
 "Fix deterministic TypeScript validation failure.",
 time,time
);

function strategy(){
 return JSON.stringify({
  ecosystem:"node",
  packageManager:"npm",
  workspace:`C:\\VEYLITH\\veylith\\workspaces\\p43-${suffix}`,
  commands:[]
 });
}

function insertRun(id){
 const cols=(db.prepare("PRAGMA table_info(validation_runs)").all()).map(row=>String(row.name));
 const values={
  id,
  project_id:projectId,
  task_id:taskId,
  workspace:`C:\VEYLITH\veylith\workspaces\p43-${suffix}`,
  status:"failed",
  strategy_json:strategy(),
  summary_json:null,
  error:null,
  created_at:time,
  updated_at:time,
  started_at:time,
  completed_at:time
 };
 const selected=Object.keys(values).filter(key=>cols.includes(key));
 const placeholders=selected.map(()=>"?").join(",");
 db.prepare(`
  INSERT INTO validation_runs(${selected.join(",")})
  VALUES(${placeholders})
 `).run(...selected.map(key=>values[key]));
}

function validationColumns(){
 return(db.prepare("PRAGMA table_info(validation_results)").all()).map(row=>String(row.name));
}

function insertFailure(runId,id,options={}){
 const cols=validationColumns();
 const values={
  id,
  run_id:runId,
  command_id:"typecheck",
  stage:"typecheck",
  status:"failed",
  command:"npx",
  args_json:JSON.stringify(["tsc","--noEmit"]),
  exit_code:2,
  stdout:"",
  stderr:"src/app.ts(10,3): error TS2322: Type 'string' is not assignable to type 'number'.",
  duration_ms:125,
  timed_out:0,
  spawn_error:null,
  failure_kind:options.failureKind||"typecheck",
  fingerprint:options.fingerprint||"fp_typecheck_same",
  retryable:options.retryable?1:0,
  created_at:time,
  updated_at:time
 };
 const selected=Object.keys(values).filter(key=>cols.includes(key));
 const placeholders=selected.map(()=>"?").join(",");
 db.prepare(`
  INSERT INTO validation_results(${selected.join(",")})
  VALUES(${placeholders})
 `).run(...selected.map(key=>values[key]));
}

insertRun(run1);
insertFailure(run1,`p43_result1_${suffix}`);

let fakeCalls=0;
const fakeDiagnostic=async(task,project,architecture,plan,validation)=>{
 fakeCalls++;
 assert.equal(task.id,taskId);
 assert.equal(project.id,projectId);
 assert.equal(validation.success,false);
 assert.equal(validation.failure.failureKind,"typecheck");
 assert.equal(validation.failure.fingerprint,"fp_typecheck_same");
 return{
  summary:"Type mismatch in application assignment.",
  rootCause:"A string value is assigned where the application expects a number.",
  evidence:["TS2322 in src/app.ts"],
  relevantFiles:["src/app.ts"],
  previousAttempts:[],
  strategy:["Correct the assignment while preserving the numeric contract."],
  avoid:["Do not weaken the type definition."],
  confidence:"high",
  fingerprint:"legacy-agent-fingerprint"
 };
};

const task={id:taskId,prompt:"Fix deterministic TypeScript validation failure."};
const project={
 id:projectId,
 workspace:`C:\\VEYLITH\\veylith\\workspaces\\p43-${suffix}`
};
const architecture={summary:"Simple TypeScript application."};
const plan={summary:"Implement typed application.",files:[{path:"src/app.ts",purpose:"Application source"}]};

await check("new deterministic failure requires diagnosis",async()=>{
 const decision=validationDiagnosticDecision(run1);
 assert.equal(decision.action,"diagnose");
 assert.equal(decision.fingerprint,"fp_typecheck_same");
 assert.equal(decision.failureKind,"typecheck");
 assert.equal(decision.retryable,false);
 assert.equal(decision.repeatedCount,0);
});

let first;
await check("diagnostic loop calls existing diagnostic agent",async()=>{
 first=await diagnoseValidationRun({
  runId:run1,task,project,architecture,plan,diagnose:fakeDiagnostic
 });
 assert.equal(fakeCalls,1);
 assert.equal(first.status,"diagnosed");
});

await check("persistent diagnosis bound to validation run",async()=>{
 const saved=getRunValidationDiagnostic(run1);
 assert.ok(saved);
 assert.equal(saved.projectId,projectId);
 assert.equal(saved.taskId,taskId);
 assert.equal(saved.failureKind,"typecheck");
});

await check("deterministic validation fingerprint remains authoritative",async()=>{
 assert.equal(first.diagnostic.fingerprint,"fp_typecheck_same");
 assert.notEqual(first.diagnostic.fingerprint,"legacy-agent-fingerprint");
});

await check("diagnostic result persisted",async()=>{
 assert.equal(first.diagnostic.rootCause,"A string value is assigned where the application expects a number.");
 assert.deepEqual(first.diagnostic.relevantFiles,["src/app.ts"]);
 assert.equal(first.diagnostic.confidence,"high");
});

await check("diagnostic record survives reload",async()=>{
 const saved=getRunValidationDiagnostic(run1);
 assert.equal(saved.status,"diagnosed");
 assert.equal(saved.diagnostic.summary,"Type mismatch in application assignment.");
});

await check("same run is idempotent and does not call AI twice",async()=>{
 const again=await diagnoseValidationRun({
  runId:run1,task,project,architecture,plan,diagnose:fakeDiagnostic
 });
 assert.equal(again.id,first.id);
 assert.equal(fakeCalls,1);
});

insertRun(run2);
insertFailure(run2,`p43_result2_${suffix}`);

await check("repeated fingerprint chooses diagnosis reuse",async()=>{
 const decision=validationDiagnosticDecision(run2);
 assert.equal(decision.action,"reuse");
 assert.ok(decision.previous);
 assert.equal(decision.previous.id,first.id);
 assert.equal(decision.repeatedCount,1);
});

let second;
await check("repeated unchanged failure reuses diagnosis without AI",async()=>{
 second=await diagnoseValidationRun({
  runId:run2,task,project,architecture,plan,diagnose:fakeDiagnostic
 });
 assert.equal(second.status,"reused");
 assert.equal(fakeCalls,1);
});

await check("reused diagnosis keeps deterministic fingerprint",async()=>{
 assert.equal(second.diagnostic.fingerprint,"fp_typecheck_same");
 assert.ok(second.diagnostic.previousAttempts.some(item=>item.includes("Diagnosis reused")));
});

await check("fingerprint history contains diagnosed and reused evidence",async()=>{
 const history=listFingerprintDiagnostics(projectId,"fp_typecheck_same");
 assert.equal(history.length,2);
 assert.ok(history.some(item=>item.status==="diagnosed"));
 assert.ok(history.some(item=>item.status==="reused"));
});

insertRun(run3);
insertFailure(run3,`p43_result3_${suffix}`,{
 fingerprint:"fp_network",
 failureKind:"infrastructure",
 retryable:true
});

await check("retryable infrastructure failure is blocked from AI diagnosis",async()=>{
 const decision=validationDiagnosticDecision(run3);
 assert.equal(decision.action,"blocked");
 assert.equal(decision.retryable,true);
});

await check("retryable infrastructure failure creates blocked diagnostic evidence",async()=>{
 const result=await diagnoseValidationRun({
  runId:run3,task,project,architecture,plan,diagnose:fakeDiagnostic
 });
 assert.equal(result.status,"blocked");
 assert.match(result.error,/retry/i);
 assert.equal(fakeCalls,1);
});

insertRun(run4);
insertFailure(run4,`p43_result4_${suffix}`,{
 fingerprint:"fp_lint_new",
 failureKind:"lint",
 retryable:false
});

let throwingCalls=0;
const throwingDiagnostic=async()=>{
 throwingCalls++;
 throw new Error("Synthetic diagnostic provider failure");
};

await check("diagnostic provider failure propagates",async()=>{
 await assert.rejects(
  ()=>diagnoseValidationRun({
   runId:run4,task,project,architecture,plan,diagnose:throwingDiagnostic
  }),
  /Synthetic diagnostic provider failure/
 );
 assert.equal(throwingCalls,1);
});

await check("failed diagnostic attempt remains retryable",async()=>{
 const saved=getRunValidationDiagnostic(run4);
 assert.equal(saved.status,"pending");
 assert.match(saved.error,/Synthetic diagnostic provider failure/);
});

await check("pending diagnostic can retry successfully",async()=>{
 const recovered=await diagnoseValidationRun({
  runId:run4,task,project,architecture,plan,
  diagnose:async()=>({
   summary:"Lint issue diagnosed.",
   rootCause:"Unused variable.",
   evidence:["lint evidence"],
   relevantFiles:["src/app.ts"],
   previousAttempts:[],
   strategy:["Remove unused variable."],
   avoid:[],
   confidence:"high",
   fingerprint:"ignored"
  })
 });
 assert.equal(recovered.status,"diagnosed");
 assert.equal(recovered.diagnostic.fingerprint,"fp_lint_new");
});

await check("run/project mismatch rejected",async()=>{
 await assert.rejects(
  ()=>diagnoseValidationRun({
   runId:run1,
   task,
   project:{...project,id:"wrong-project"},
   architecture,
   plan,
   diagnose:fakeDiagnostic
  }),
  /does not belong/
 );
});

await check("run/task mismatch rejected",async()=>{
 await assert.rejects(
  ()=>diagnoseValidationRun({
   runId:run1,
   task:{...task,id:"wrong-task"},
   project,
   architecture,
   plan,
   diagnose:fakeDiagnostic
  }),
  /does not belong/
 );
});

await check("successful/no-failure validation evidence cannot be diagnosed",async()=>{
 const emptyRun=`p43_empty_${suffix}`;
 insertRun(emptyRun);
 await assert.rejects(
  async()=>{
   db.prepare("DELETE FROM validation_results WHERE run_id=?").run(emptyRun);
   validationDiagnosticDecision(emptyRun);
  },
  /no failed validation evidence/
 );
 db.prepare("DELETE FROM validation_runs WHERE id=?").run(emptyRun);
});

await check("diagnostic project memory written",async()=>{
 const rows=db.prepare(`
  SELECT type,content
  FROM project_memory
  WHERE project_id=?
  ORDER BY id DESC
 `).all(projectId);
 assert.ok(rows.some(row=>String(row.type)==="validation_diagnostic"));
 assert.ok(rows.some(row=>String(row.type)==="diagnostic_reused"));
});

await check("diagnostic cleanup succeeds",async()=>{
 for(const run of[run1,run2,run3,run4])deleteValidationDiagnosticsByRun(run);
 assert.equal(
  Number(db.prepare("SELECT COUNT(*) total FROM validation_diagnostics WHERE project_id=?").get(projectId).total),
  0
 );
});

for(const run of[run1,run2,run3,run4]){
 db.prepare("DELETE FROM validation_results WHERE run_id=?").run(run);
 db.prepare("DELETE FROM validation_runs WHERE id=?").run(run);
}
db.prepare("DELETE FROM project_memory WHERE project_id=?").run(projectId);
db.prepare("DELETE FROM tasks WHERE id=?").run(taskId);
db.prepare("DELETE FROM projects WHERE id=?").run(projectId);

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 4 PASS 4.3");
console.log(" AUTONOMOUS DIAGNOSTIC LOOP");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("");
console.log(failed===0
 ?"VEYLITH v1.0 BATCH 4 PASS 4.3 PASSED"
 :"VEYLITH v1.0 BATCH 4 PASS 4.3 NOT YET CLOSED");
process.exitCode=failed===0?0:1;


