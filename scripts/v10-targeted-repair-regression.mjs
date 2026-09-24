import assert from"node:assert/strict";
import crypto from"node:crypto";
import{db}from"../dist/database/database.js";
import{
 createValidationDiagnostic,
 setValidationDiagnosticState,
 deleteValidationDiagnosticsByRun
}from"../dist/validation/validation-diagnostic.repository.js";
import{
 deleteValidationRepairAttemptsByRun,
 getValidationRepairAttempt,
 listFingerprintValidationRepairs
}from"../dist/validation/validation-repair.repository.js";
import{
 executeTargetedValidationRepair,
 validationRepairDecision
}from"../dist/validation/validation-repair.service.js";

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
const projectId=`p44_project_${suffix}`;
const taskId=`p44_task_${suffix}`;
const workspace=`C:\\VEYLITH\\veylith\\workspaces\\p44-${suffix}`;
const time=new Date().toISOString();

db.prepare(`
 INSERT INTO projects(
  id,name,slug,status,progress,workspace,created_at,updated_at,phase
 )VALUES(?,?,?,'active',0,?,?,?,'repair')
`).run(
 projectId,
 "Pass 4.4 Repair Fixture",
 `p44-${suffix}`,
 workspace,
 time,time
);

db.prepare(`
 INSERT INTO tasks(
  id,project_id,title,prompt,status,phase,priority,attempts,max_attempts,
  created_at,updated_at,repair_attempts
 )VALUES(?,?,?,?,'running','repair',0,1,3,?,?,0)
`).run(
 taskId,
 projectId,
 "Repair deterministic failure",
 "Fix the typed application failure.",
 time,time
);

function tableColumns(table){
 return(db.prepare(`PRAGMA table_info(${table})`).all())
  .map(row=>String(row.name));
}

function insertAdaptive(table,values){
 const columns=tableColumns(table);
 const selected=Object.keys(values).filter(key=>columns.includes(key));
 db.prepare(`
  INSERT INTO ${table}(${selected.join(",")})
  VALUES(${selected.map(()=>"?").join(",")})
 `).run(...selected.map(key=>values[key]));
}

function insertRun(runId,fingerprint="fp_p44",kind="typecheck"){
 insertAdaptive("validation_runs",{
  id:runId,
  project_id:projectId,
  task_id:taskId,
  workspace,
  status:"failed",
  strategy_json:JSON.stringify({
   workspace,
   ecosystem:"node",
   packageManager:"npm",
   commands:[]
  }),
  summary:"Validation failed.",
  created_at:time,
  updated_at:time,
  started_at:time,
  completed_at:time
 });

 insertAdaptive("validation_results",{
  id:`result_${runId}`,
  run_id:runId,
  command_id:"typecheck",
  stage:"typecheck",
  command:"npx",
  args_json:JSON.stringify(["tsc","--noEmit"]),
  status:"failed",
  exit_code:2,
  duration_ms:100,
  stdout:"",
  stderr:"src/app.ts(4,1): error TS2322",
  failure_kind:kind,
  fingerprint,
  created_at:time,
  updated_at:time
 });
}

function diagnosticFor(runId,fingerprint="fp_p44",kind="typecheck",confidence="high"){
 const row=createValidationDiagnostic({
  runId,
  projectId,
  taskId,
  fingerprint,
  failureKind:kind
 });
 return setValidationDiagnosticState(row.id,"diagnosed",{
  diagnostic:{
   summary:"Typed assignment failure.",
   rootCause:"Incorrect assignment.",
   evidence:["TS2322"],
   relevantFiles:["src/app.ts"],
   previousAttempts:[],
   strategy:["Repair src/app.ts."],
   avoid:["Do not weaken types."],
   confidence,
   fingerprint
  }
 });
}

const task={id:taskId,prompt:"Fix the typed application failure."};
const project={id:projectId,workspace};
const architecture={summary:"TypeScript app"};
const plan={
 summary:"Typed application",
 files:[{path:"src/app.ts",purpose:"Application"}]
};

const run1=`p44_run1_${suffix}`;
insertRun(run1);
const diagnostic1=diagnosticFor(run1);

await check("diagnosed code failure is repairable",async()=>{
 const decision=validationRepairDecision(run1);
 assert.equal(decision.action,"repair");
 assert.equal(decision.attempt,1);
 assert.equal(decision.scope,"focused");
});

let repairCalls=0;
let applyCalls=0;
let receivedDiagnostic=null;
let receivedHistory=null;

const repairFn=async(
 taskArg,
 projectArg,
 architectureArg,
 planArg,
 failureArg,
 reviewArg,
 diagnosticArg,
 historyArg
)=>{
 repairCalls++;
 receivedDiagnostic=diagnosticArg;
 receivedHistory=historyArg;
 assert.equal(taskArg.id,taskId);
 assert.equal(projectArg.id,projectId);
 assert.equal(failureArg.success,false);
 assert.equal(failureArg.failure.fingerprint,"fp_p44");
 return{
  summary:"Correct typed assignment.",
  files:[{
   path:"src/app.ts",
   content:"export const value:number=1;\n"
  }],
  commands:[{
   command:"npx",
   args:["tsc","--noEmit"],
   purpose:"Verify type repair"
  }]
 };
};

const applyFn=async(result,taskArg,projectArg,planArg)=>{
 applyCalls++;
 assert.equal(result.files[0].path,"src/app.ts");
 assert.equal(taskArg.id,taskId);
 assert.equal(projectArg.id,projectId);
 assert.equal(planArg.summary,plan.summary);
};

let firstRepair;

await check("targeted repair calls existing repair contract",async()=>{
 firstRepair=await executeTargetedValidationRepair({
  runId:run1,
  task,
  project,
  architecture,
  plan,
  repair:repairFn,
  apply:applyFn
 });
 assert.equal(repairCalls,1);
 assert.equal(firstRepair.status,"applied");
});

await check("persisted diagnosis is passed to repair engine",async()=>{
 assert.equal(receivedDiagnostic.rootCause,"Incorrect assignment.");
 assert.equal(receivedDiagnostic.fingerprint,"fp_p44");
});

await check("repair history is passed to repair engine",async()=>{
 assert.ok(Array.isArray(receivedHistory));
 assert.equal(receivedHistory.length,1);
 assert.equal(receivedHistory[0].attempt,1);
 assert.equal(receivedHistory[0].fingerprint,"fp_p44");
 assert.ok(typeof receivedHistory[0].summary==="string");
 assert.ok(Array.isArray(receivedHistory[0].files));
 assert.equal(receivedHistory[0].validation.success,false);
});

await check("protected apply path executes exactly once",async()=>{
 assert.equal(applyCalls,1);
});

await check("repair files are persisted",async()=>{
 const saved=getValidationRepairAttempt(firstRepair.id);
 assert.deepEqual(saved.files,["src/app.ts"]);
 assert.equal(saved.repair.summary,"Correct typed assignment.");
});

await check("same diagnostic does not execute repair twice",async()=>{
 const again=await executeTargetedValidationRepair({
  runId:run1,
  task,
  project,
  architecture,
  plan,
  repair:repairFn,
  apply:applyFn
 });
 assert.equal(again.id,firstRepair.id);
 assert.equal(repairCalls,1);
 assert.equal(applyCalls,1);
});

await check("repair attempt survives reload",async()=>{
 const saved=getValidationRepairAttempt(firstRepair.id);
 assert.equal(saved.status,"applied");
 assert.equal(saved.scope,"focused");
});

const run2=`p44_run2_${suffix}`;
insertRun(run2);
diagnosticFor(run2);

await check("repeated fingerprint expands repair scope",async()=>{
 const decision=validationRepairDecision(run2);
 assert.equal(decision.action,"repair");
 assert.equal(decision.scope,"expanded");
});

const run3=`p44_run3_${suffix}`;
insertRun(run3);
diagnosticFor(run3);

let broadSeed;
await check("second repeated applied repair can be persisted",async()=>{
 broadSeed=await executeTargetedValidationRepair({
  runId:run3,
  task,
  project,
  architecture,
  plan,
  repair:async()=>({
   summary:"Second repair",
   files:[{path:"src/app.ts",content:"export const value:number=2;\n"}],
   commands:[]
  }),
  apply:async()=>{}
 });
 assert.equal(broadSeed.status,"applied");
});

const run4=`p44_run4_${suffix}`;
insertRun(run4);
diagnosticFor(run4);

await check("multiple prior applied repairs widen scope to broad",async()=>{
 const decision=validationRepairDecision(run4);
 assert.equal(decision.scope,"broad");
});

const run5=`p44_run5_${suffix}`;
insertRun(run5,"fp_low_confidence","lint");
diagnosticFor(run5,"fp_low_confidence","lint","low");

await check("low-confidence diagnosis starts broad",async()=>{
 const decision=validationRepairDecision(run5);
 assert.equal(decision.scope,"broad");
});

const run6=`p44_run6_${suffix}`;
insertRun(run6,"fp_infra","infrastructure");
const infraDiagnostic=createValidationDiagnostic({
 runId:run6,
 projectId,
 taskId,
 fingerprint:"fp_infra",
 failureKind:"infrastructure"
});
setValidationDiagnosticState(infraDiagnostic.id,"blocked",{
 error:"Retryable infrastructure failure should be retried before AI diagnosis."
});

let infraRepairCalls=0;
let infraApplyCalls=0;

await check("infrastructure failure is blocked from source repair",async()=>{
 const result=await executeTargetedValidationRepair({
  runId:run6,
  task,
  project,
  architecture,
  plan,
  repair:async()=>{
   infraRepairCalls++;
   throw new Error("must not execute");
  },
  apply:async()=>{
   infraApplyCalls++;
  }
 });
 assert.equal(result.status,"blocked");
 assert.equal(infraRepairCalls,0);
 assert.equal(infraApplyCalls,0);
});

const run7=`p44_run7_${suffix}`;
insertRun(run7,"fp_focus_guard","typecheck");
diagnosticFor(run7,"fp_focus_guard","typecheck","high");

await check("focused repair rejects unrelated files before apply",async()=>{
 let applied=0;
 await assert.rejects(
  ()=>executeTargetedValidationRepair({
   runId:run7,
   task,
   project,
   architecture,
   plan,
   repair:async()=>({
    summary:"Unsafe broad edit",
    files:[{
     path:"src/unrelated.ts",
     content:"export const unrelated=true;\n"
    }],
    commands:[]
   }),
   apply:async()=>{applied++;}
  }),
  /Focused repair attempted unrelated files/
 );
 assert.equal(applied,0);
});

await check("failed repair attempt is persisted",async()=>{
 const rows=listFingerprintValidationRepairs(
  projectId,
  "fp_focus_guard"
 );
 assert.equal(rows.length,1);
 assert.equal(rows[0].status,"failed");
 assert.match(rows[0].error,/unrelated files/);
});

const run8=`p44_run8_${suffix}`;
insertRun(run8,"fp_provider_failure","test");
diagnosticFor(run8,"fp_provider_failure","test","high");

let providerCalls=0;

await check("repair provider failure propagates",async()=>{
 await assert.rejects(
  ()=>executeTargetedValidationRepair({
   runId:run8,
   task,
   project,
   architecture,
   plan,
   repair:async()=>{
    providerCalls++;
    throw new Error("Synthetic repair provider failure");
   },
   apply:async()=>{}
  }),
  /Synthetic repair provider failure/
 );
 assert.equal(providerCalls,1);
});

await check("failed repair can start next attempt",async()=>{
 const decision=validationRepairDecision(run8);
 assert.equal(decision.action,"repair");
 assert.equal(decision.attempt,2);
});

await check("project mismatch rejected",async()=>{
 await assert.rejects(
  ()=>executeTargetedValidationRepair({
   runId:run1,
   task,
   project:{...project,id:"wrong-project"},
   architecture,
   plan,
   repair:repairFn,
   apply:applyFn
  }),
  /does not belong/
 );
});

await check("task mismatch rejected",async()=>{
 await assert.rejects(
  ()=>executeTargetedValidationRepair({
   runId:run1,
   task:{...task,id:"wrong-task"},
   project,
   architecture,
   plan,
   repair:repairFn,
   apply:applyFn
  }),
  /does not belong/
 );
});

await check("validation repair memory is written",async()=>{
 const rows=db.prepare(`
  SELECT type,content
  FROM project_memory
  WHERE project_id=?
 `).all(projectId);
 assert.ok(rows.some(row=>String(row.type)==="validation_repair"));
});

await check("repair history remains fingerprint scoped",async()=>{
 const rows=listFingerprintValidationRepairs(projectId,"fp_p44");
 assert.ok(rows.length>=2);
 assert.ok(rows.every(row=>row.fingerprint==="fp_p44"));
});

const allRuns=[
 run1,run2,run3,run4,run5,run6,run7,run8
];

await check("persistent repair cleanup succeeds",async()=>{
 for(const runId of allRuns)deleteValidationRepairAttemptsByRun(runId);
 const count=Number(
  db.prepare(`
   SELECT COUNT(*) total
   FROM validation_repair_attempts
   WHERE project_id=?
  `).get(projectId).total
 );
 assert.equal(count,0);
});

for(const runId of allRuns){
 deleteValidationDiagnosticsByRun(runId);
 db.prepare("DELETE FROM validation_results WHERE run_id=?").run(runId);
 db.prepare("DELETE FROM validation_runs WHERE id=?").run(runId);
}
db.prepare("DELETE FROM project_memory WHERE project_id=?").run(projectId);
db.prepare("DELETE FROM tasks WHERE id=?").run(taskId);
db.prepare("DELETE FROM projects WHERE id=?").run(projectId);

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 4 PASS 4.4");
console.log(" TARGETED REPAIR EXECUTION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("");
console.log(
 failed===0
 ?"VEYLITH v1.0 BATCH 4 PASS 4.4 PASSED"
 :"VEYLITH v1.0 BATCH 4 PASS 4.4 NOT YET CLOSED"
);
process.exitCode=failed===0?0:1;

