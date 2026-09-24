import assert from"node:assert/strict";
import crypto from"node:crypto";
import{db}from"../dist/database/database.js";
import{
 createValidationRepairAttempt,
 setValidationRepairAttemptState,
 deleteValidationRepairAttemptsByRun
}from"../dist/validation/validation-repair.repository.js";
import{
 analyzeRepairVerification,
 verifyValidationRepair
}from"../dist/validation/repair-verification.service.js";
import{
 getRepairAttemptVerification,
 deleteRepairVerificationsByProject
}from"../dist/validation/repair-verification.repository.js";

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
const projectId=`p45_project_${suffix}`;
const taskId=`p45_task_${suffix}`;
const workspace=`C:\\VEYLITH\\veylith\\workspaces\\p45-${suffix}`;
const time=new Date().toISOString();

db.prepare(`
 INSERT INTO projects(
  id,name,slug,status,progress,workspace,created_at,updated_at,phase
 )VALUES(?,?,?,'active',0,?,?,?,'validation')
`).run(
 projectId,
 "Pass 4.5 Verification Fixture",
 `p45-${suffix}`,
 workspace,
 time,
 time
);

db.prepare(`
 INSERT INTO tasks(
  id,project_id,title,prompt,status,phase,priority,attempts,max_attempts,
  created_at,updated_at,repair_attempts
 )VALUES(?,?,?,?,'running','validation',0,1,3,?,?,1)
`).run(
 taskId,
 projectId,
 "Verify repair",
 "Verify repair without regression.",
 time,
 time
);

function tableColumns(table){
 return(db.prepare(`PRAGMA table_info(${table})`).all())
  .map(row=>String(row.name));
}

function insertAdaptive(table,values){
 const columns=tableColumns(table);
 const selected=Object.keys(values)
  .filter(key=>columns.includes(key));

 db.prepare(`
  INSERT INTO ${table}(${selected.join(",")})
  VALUES(${selected.map(()=>"?").join(",")})
 `).run(...selected.map(key=>values[key]));
}

function insertRun(runId,status="failed"){
 insertAdaptive("validation_runs",{
  id:runId,
  project_id:projectId,
  task_id:taskId,
  workspace,
  status,
  strategy_json:JSON.stringify({
   workspace,
   ecosystem:"node",
   packageManager:"npm",
   commands:[]
  }),
  summary:status==="passed"
   ?"Validation passed."
   :"Validation failed.",
  created_at:time,
  updated_at:time,
  started_at:time,
  completed_at:time
 });
}

function insertResult(
 runId,
 commandId,
 stage,
 status,
 fingerprint=null,
 index=0
){
 insertAdaptive("validation_results",{
  id:`${runId}_${commandId}_${index}`,
  run_id:runId,
  command_id:commandId,
  stage,
  command:stage==="test"?"npm":"npx",
  args_json:JSON.stringify(
   stage==="test"
    ?["test"]
    :stage==="lint"
     ?["eslint","."]
     :["tsc","--noEmit"]
  ),
  status,
  exit_code:status==="passed"?0:1,
  duration_ms:100+index,
  stdout:status==="passed"?"ok":"",
  stderr:status==="failed"?"synthetic failure":"",
  failure_kind:status==="failed"?stage:null,
  fingerprint,
  created_at:new Date(Date.now()+index).toISOString(),
  updated_at:new Date(Date.now()+index).toISOString()
 });
}

function appliedRepair(runId,fingerprint){
 const attempt=createValidationRepairAttempt({
  runId,
  diagnosticId:`diagnostic_${runId}`,
  projectId,
  taskId,
  attempt:1,
  fingerprint,
  failureKind:"typecheck",
  scope:"focused"
 });

 return setValidationRepairAttemptState(
  attempt.id,
  "applied",
  {
   repair:{
    summary:"Synthetic applied repair",
    files:[{
     path:"src/app.ts",
     content:"export const value:number=1;\n"
    }],
    commands:[]
   },
   files:["src/app.ts"],
   error:null
  }
 );
}

const originalFingerprint="fp_original_typecheck";

const before1=`p45_before1_${suffix}`;
const after1=`p45_after1_${suffix}`;

insertRun(before1,"failed");
insertResult(before1,"lint","lint","passed",null,1);
insertResult(
 before1,
 "typecheck",
 "typecheck",
 "failed",
 originalFingerprint,
 2
);
insertResult(before1,"test","test","passed",null,3);

insertRun(after1,"passed");
insertResult(after1,"lint","lint","passed",null,4);
insertResult(after1,"typecheck","typecheck","passed",null,5);
insertResult(after1,"test","test","passed",null,6);

const repair1=appliedRepair(
 before1,
 originalFingerprint
);

await check("verification analysis detects original failure resolved",async()=>{
 const analysis=analyzeRepairVerification(
  before1,
  after1,
  originalFingerprint
 );
 assert.equal(analysis.originalResolved,true);
});

await check("verification analysis preserves previously passing checks",async()=>{
 const analysis=analyzeRepairVerification(
  before1,
  after1,
  originalFingerprint
 );
 assert.equal(analysis.regressionFree,true);
 assert.deepEqual(
  analysis.beforePassing.sort(),
  ["lint","test"]
 );
});

let verification1;

await check("applied repair becomes verified",async()=>{
 verification1=verifyValidationRepair({
  repairAttemptId:repair1.id,
  afterRunId:after1
 });
 assert.equal(verification1.status,"verified");
 assert.equal(verification1.originalResolved,true);
 assert.equal(verification1.regressionFree,true);
});

await check("verified repair persists before and after validation ids",async()=>{
 const saved=getRepairAttemptVerification(repair1.id);
 assert.equal(saved.beforeRunId,before1);
 assert.equal(saved.afterRunId,after1);
});

await check("verification is idempotent",async()=>{
 const again=verifyValidationRepair({
  repairAttemptId:repair1.id,
  afterRunId:after1
 });
 assert.equal(again.id,verification1.id);
});

const before2=`p45_before2_${suffix}`;
const after2=`p45_after2_${suffix}`;

insertRun(before2,"failed");
insertResult(before2,"lint","lint","passed",null,10);
insertResult(
 before2,
 "typecheck",
 "typecheck",
 "failed",
 "fp_regression_source",
 11
);
insertResult(before2,"test","test","passed",null,12);

insertRun(after2,"failed");
insertResult(after2,"lint","lint","failed","fp_new_lint",13);
insertResult(after2,"typecheck","typecheck","passed",null,14);
insertResult(after2,"test","test","passed",null,15);

const repair2=appliedRepair(
 before2,
 "fp_regression_source"
);

await check("resolved original failure with new regression is detected",async()=>{
 const analysis=analyzeRepairVerification(
  before2,
  after2,
  "fp_regression_source"
 );
 assert.equal(analysis.originalResolved,true);
 assert.equal(analysis.regressionFree,false);
 assert.deepEqual(analysis.regressions,["lint"]);
});

await check("regressing repair is not verified",async()=>{
 const result=verifyValidationRepair({
  repairAttemptId:repair2.id,
  afterRunId:after2
 });
 assert.equal(result.status,"regressed");
 assert.equal(result.originalResolved,true);
 assert.equal(result.regressionFree,false);
 assert.deepEqual(result.regressions,["lint"]);
});

const before3=`p45_before3_${suffix}`;
const after3=`p45_after3_${suffix}`;

insertRun(before3,"failed");
insertResult(before3,"lint","lint","passed",null,20);
insertResult(
 before3,
 "typecheck",
 "typecheck",
 "failed",
 "fp_unresolved",
 21
);

insertRun(after3,"failed");
insertResult(after3,"lint","lint","passed",null,22);
insertResult(
 after3,
 "typecheck",
 "typecheck",
 "failed",
 "fp_unresolved",
 23
);

const repair3=appliedRepair(
 before3,
 "fp_unresolved"
);

await check("same original fingerprint after repair is unresolved",async()=>{
 const analysis=analyzeRepairVerification(
  before3,
  after3,
  "fp_unresolved"
 );
 assert.equal(analysis.originalResolved,false);
});

await check("unresolved repair becomes failed verification",async()=>{
 const result=verifyValidationRepair({
  repairAttemptId:repair3.id,
  afterRunId:after3
 });
 assert.equal(result.status,"failed");
 assert.equal(result.originalResolved,false);
});

const before4=`p45_before4_${suffix}`;
const after4=`p45_after4_${suffix}`;

insertRun(before4,"failed");
insertResult(before4,"lint","lint","passed",null,30);
insertResult(
 before4,
 "typecheck",
 "typecheck",
 "failed",
 "fp_missing_check",
 31
);
insertResult(before4,"test","test","passed",null,32);

insertRun(after4,"passed");
insertResult(after4,"typecheck","typecheck","passed",null,33);
insertResult(after4,"test","test","passed",null,34);

const repair4=appliedRepair(
 before4,
 "fp_missing_check"
);

await check("missing previously passing validation check counts as regression",async()=>{
 const analysis=analyzeRepairVerification(
  before4,
  after4,
  "fp_missing_check"
 );
 assert.equal(analysis.originalResolved,true);
 assert.equal(analysis.regressionFree,false);
 assert.deepEqual(analysis.regressions,["lint"]);
});

await check("missing prior validation check cannot verify repair",async()=>{
 const result=verifyValidationRepair({
  repairAttemptId:repair4.id,
  afterRunId:after4
 });
 assert.equal(result.status,"regressed");
});

const before5=`p45_before5_${suffix}`;
const after5=`p45_after5_${suffix}`;

insertRun(before5,"failed");
insertResult(
 before5,
 "typecheck",
 "typecheck",
 "failed",
 "fp_project_guard",
 40
);

insertRun(after5,"passed");
insertResult(after5,"typecheck","typecheck","passed",null,41);

const repair5=appliedRepair(
 before5,
 "fp_project_guard"
);

const otherProject=`p45_other_${suffix}`;

db.prepare(`
 INSERT INTO projects(
  id,name,slug,status,progress,workspace,created_at,updated_at,phase
 )VALUES(?,?,?,'active',0,?,?,?,'validation')
`).run(
 otherProject,
 "Other Project",
 `p45-other-${suffix}`,
 `${workspace}-other`,
 time,
 time
);

db.prepare(`
 UPDATE validation_runs
 SET project_id=?
 WHERE id=?
`).run(otherProject,after5);

await check("cross-project verification rejected",async()=>{
 assert.throws(
  ()=>verifyValidationRepair({
   repairAttemptId:repair5.id,
   afterRunId:after5
  }),
  /different project/
 );
});

db.prepare(`
 UPDATE validation_runs
 SET project_id=?
 WHERE id=?
`).run(projectId,after5);

await check("non-applied repair cannot be verified",async()=>{
 const pending=createValidationRepairAttempt({
  runId:before5,
  diagnosticId:`diagnostic_pending_${suffix}`,
  projectId,
  taskId,
  attempt:1,
  fingerprint:"fp_pending",
  failureKind:"typecheck",
  scope:"focused"
 });

 assert.throws(
  ()=>verifyValidationRepair({
   repairAttemptId:pending.id,
   afterRunId:after5
  }),
  /not applied/
 );

 deleteValidationRepairAttemptsByRun(before5);
});

await check("repair verification memory is written",async()=>{
 const rows=db.prepare(`
  SELECT type,content
  FROM project_memory
  WHERE project_id=?
 `).all(projectId);

 assert.ok(
  rows.some(row=>
   String(row.type)==="repair_verification"
  )
 );
});

await check("verification survives repository reload",async()=>{
 const saved=getRepairAttemptVerification(repair1.id);
 assert.equal(saved.status,"verified");
 assert.equal(saved.originalResolved,true);
 assert.equal(saved.regressionFree,true);
});

const allRuns=[
 before1,after1,
 before2,after2,
 before3,after3,
 before4,after4,
 before5,after5
];

await check("verification cleanup succeeds",async()=>{
 deleteRepairVerificationsByProject(projectId);

 const count=Number(
  db.prepare(`
   SELECT COUNT(*) total
   FROM repair_verifications
   WHERE project_id=?
  `).get(projectId).total
 );

 assert.equal(count,0);
});

deleteRepairVerificationsByProject(projectId);

for(const runId of allRuns){
 deleteValidationRepairAttemptsByRun(runId);
 db.prepare(`
  DELETE FROM validation_results WHERE run_id=?
 `).run(runId);
 db.prepare(`
  DELETE FROM validation_runs WHERE id=?
 `).run(runId);
}

db.prepare(`
 DELETE FROM project_memory WHERE project_id=?
`).run(projectId);

db.prepare(`
 DELETE FROM tasks WHERE id=?
`).run(taskId);

db.prepare(`
 DELETE FROM projects WHERE id=?
`).run(otherProject);

db.prepare(`
 DELETE FROM projects WHERE id=?
`).run(projectId);

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 4 PASS 4.5");
console.log(" REPAIR VERIFICATION + REGRESSION PROTECTION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("");
console.log(
 failed===0
 ?"VEYLITH v1.0 BATCH 4 PASS 4.5 PASSED"
 :"VEYLITH v1.0 BATCH 4 PASS 4.5 NOT YET CLOSED"
);

process.exitCode=failed===0?0:1;
