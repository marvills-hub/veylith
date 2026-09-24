import{db}from"../dist/database/database.js";
import{
 createValidationRun,
 deleteValidationRun,
 getValidationRun,
 listProjectValidationRuns,
 listTaskValidationRuns,
 listValidationResults,
 recordValidationResult,
 setValidationRunState
}from"../dist/validation/validation-evidence.repository.js";
import{
 classifyValidationFailure
}from"../dist/validation/validation-failure-classifier.service.js";

let passed=0;
let failed=0;

function check(name,condition,detail=""){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${name}`);
  if(detail)console.log(detail);
 }
}

const suffix=Date.now().toString(36);
const projectId=`prj_v10_validation_${suffix}`;
const taskId=`tsk_v10_validation_${suffix}`;
const now=new Date().toISOString();

let runId=null;

try{
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,progress,workspace,created_at,updated_at,phase
  )VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  projectId,
  "Validation Evidence Regression",
  `validation-evidence-${suffix}`,
  "active",
  0,
  `workspaces/validation-evidence-${suffix}`,
  now,
  now,
  "validation"
 );

 db.prepare(`
  INSERT INTO tasks(
   id,project_id,title,prompt,status,phase,priority,attempts,max_attempts,
   result,error,created_at,started_at,completed_at,updated_at,repair_attempts
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  taskId,
  projectId,
  "Validation evidence fixture",
  "Regression fixture",
  "running",
  "validation",
  0,
  0,
  3,
  null,
  null,
  now,
  now,
  null,
  now,
  0
 );

 const strategy={
  workspace:`C:\\VEYLITH\\fixture-${suffix}`,
  ecosystem:"node",
  packageManager:"npm",
  manifestPath:`C:\\VEYLITH\\fixture-${suffix}\\package.json`,
  lockfilePath:`C:\\VEYLITH\\fixture-${suffix}\\package-lock.json`,
  typescript:true,
  commands:[
   {
    id:"build:build",
    stage:"build",
    command:"npm",
    args:["run","build"],
    cwd:`C:\\VEYLITH\\fixture-${suffix}`,
    script:"build",
    required:true,
    source:"package-script"
   },
   {
    id:"test:test",
    stage:"test",
    command:"npm",
    args:["run","test"],
    cwd:`C:\\VEYLITH\\fixture-${suffix}`,
    script:"test",
    required:true,
    source:"package-script"
   }
  ],
  generatedAt:now
 };

 const run=createValidationRun({
  projectId,
  taskId,
  workspace:strategy.workspace,
  strategy
 });

 runId=run.id;

 check("validation run created",Boolean(runId));
 check("validation run starts running",run.status==="running");
 check("validation run bound to project",run.projectId===projectId);
 check("validation run bound to task",run.taskId===taskId);
 check("validation strategy persisted",run.strategy.commands.length===2);

 const buildFailure=classifyValidationFailure({
  stage:"build",
  exitCode:2,
  stderr:"src/index.ts(4,3): error TS2322: Type string is not assignable to number."
 });

 check("build failure classified",buildFailure.kind==="build");
 check("build failure not retryable",buildFailure.retryable===false);
 check("build failure fingerprint generated",buildFailure.fingerprint.length===24);

 const first=recordValidationResult({
  runId,
  commandId:"build:build",
  stage:"build",
  command:"npm",
  args:["run","build"],
  status:"failed",
  exitCode:2,
  durationMs:150,
  stdout:"",
  stderr:"src/index.ts(4,3): error TS2322: Type string is not assignable to number.",
  failureKind:buildFailure.kind,
  fingerprint:buildFailure.fingerprint
 });

 check("failed validation result persisted",first.status==="failed");
 check("result exit code persisted",first.exitCode===2);
 check("result duration persisted",first.durationMs===150);
 check("result failure kind persisted",first.failureKind==="build");
 check("result fingerprint persisted",first.fingerprint===buildFailure.fingerprint);

 const duplicate=recordValidationResult({
  runId,
  commandId:"build:build",
  stage:"build",
  command:"npm",
  args:["run","build"],
  status:"passed",
  exitCode:0,
  durationMs:100,
  stdout:"build complete",
  stderr:""
 });

 check("same command result updates idempotently",duplicate.id===first.id);
 check("updated result status persisted",duplicate.status==="passed");
 check("updated result clears failure kind",duplicate.failureKind===null);
 check("updated result clears fingerprint",duplicate.fingerprint===null);

 const testFailure=classifyValidationFailure({
  stage:"test",
  exitCode:1,
  stdout:"FAIL src/todo.test.ts expected 2 received 3"
 });

 check("test failure classified",testFailure.kind==="test");

 recordValidationResult({
  runId,
  commandId:"test:test",
  stage:"test",
  command:"npm",
  args:["run","test"],
  status:"failed",
  exitCode:1,
  durationMs:200,
  stdout:"FAIL src/todo.test.ts expected 2 received 3",
  stderr:"",
  failureKind:testFailure.kind,
  fingerprint:testFailure.fingerprint
 });

 const results=listValidationResults(runId);
 check("two command results persisted",results.length===2);
 check("result ordering stable",results[0].commandId==="build:build");
 check("second result is test failure",results[1].failureKind==="test");

 const completed=setValidationRunState(
  runId,
  "failed",
  "1 of 2 validation commands failed."
 );

 check("validation run becomes failed",completed.status==="failed");
 check("validation summary persisted",completed.summary?.includes("1 of 2")===true);
 check("validation completion timestamp persisted",Boolean(completed.completedAt));

 const reloaded=getValidationRun(runId);
 check("validation run survives reload",reloaded?.id===runId);
 check("persisted strategy survives reload",reloaded?.strategy.typescript===true);

 check(
  "project validation history contains run",
  listProjectValidationRuns(projectId).some(item=>item.id===runId)
 );

 check(
  "task validation history contains run",
  listTaskValidationRuns(taskId).some(item=>item.id===runId)
 );

 const timeout=classifyValidationFailure({
  stage:"test",
  exitCode:null,
  timedOut:true,
  stderr:"command timeout"
 });

 check("timeout classified before stage failure",timeout.kind==="timeout");
 check("timeout marked retryable",timeout.retryable===true);

 const spawn=classifyValidationFailure({
  stage:"build",
  exitCode:null,
  spawnError:"spawn EINVAL"
 });

 check("spawn error classified infrastructure",spawn.kind==="infrastructure");
 check("spawn error marked retryable",spawn.retryable===true);

 const network=classifyValidationFailure({
  stage:"install",
  exitCode:1,
  stderr:"npm ERR! network ECONNRESET"
 });

 check("network failure classified infrastructure",network.kind==="infrastructure");
 check("network failure marked retryable",network.retryable===true);

 const dependency=classifyValidationFailure({
  stage:"install",
  exitCode:1,
  stderr:"npm ERR! code ERESOLVE unable to resolve dependency tree"
 });

 check("dependency failure classified",dependency.kind==="dependency");
 check("dependency failure not retryable automatically",dependency.retryable===false);

 const typecheck=classifyValidationFailure({
  stage:"typecheck",
  exitCode:2,
  stderr:"error TS2339: Property x does not exist"
 });

 check("typecheck failure classified",typecheck.kind==="typecheck");

 const lint=classifyValidationFailure({
  stage:"lint",
  exitCode:1,
  stdout:"1 error and 0 warnings"
 });

 check("lint failure classified",lint.kind==="lint");

 const command=classifyValidationFailure({
  stage:"install",
  exitCode:7,
  stderr:"unknown install command failure"
 });

 check("generic non-zero command classified",command.kind==="command");

 const fingerprintA=classifyValidationFailure({
  stage:"test",
  exitCode:1,
  stderr:"C:\\repo\\src\\a.test.ts expected 2 received 3 in 125ms"
 });

 const fingerprintB=classifyValidationFailure({
  stage:"test",
  exitCode:1,
  stderr:"D:\\other\\src\\a.test.ts expected 2 received 3 in 999ms"
 });

 check(
  "failure fingerprints normalize volatile path and timing data",
  fingerprintA.fingerprint===fingerprintB.fingerprint
 );

 deleteValidationRun(runId);
 runId=null;

 check(
  "validation run cleanup succeeds",
  getValidationRun(completed.id)===null
 );

 check(
  "validation result cleanup succeeds",
  listValidationResults(completed.id).length===0
 );
}finally{
 if(runId){
  try{deleteValidationRun(runId);}catch{}
 }
 try{db.prepare("DELETE FROM tasks WHERE id=?").run(taskId);}catch{}
 try{db.prepare("DELETE FROM projects WHERE id=?").run(projectId);}catch{}
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 4 PASS 4.2");
console.log(" VALIDATION EVIDENCE + FAILURE CLASSIFICATION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 4 PASS 4.2 PASSED");
}else{
 console.log("\nVEYLITH v1.0 BATCH 4 PASS 4.2 NOT YET CLOSED");
 process.exitCode=1;
}
