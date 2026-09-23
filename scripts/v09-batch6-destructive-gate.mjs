import {spawnSync} from "node:child_process";
import fs from "node:fs";

const suites=[
 ["Build","npm",["run","build"]],
 ["Pass 1 - Queue + Concurrency","node",["scripts/v09-queue-concurrency-stress.mjs"]],
 ["Pass 2 - Worker Loss + Lease Recovery","node",["scripts/v09-worker-lease-stress.mjs"]],
 ["Pass 3A - Runtime Durability","node",["scripts/v09-durability-regression.mjs"]],
 ["Pass 3B - Force-Kill + Restart Continuity","node",["scripts/v09-runtime-restart-stress.mjs"]],
 ["Pass 4 - Provider Interruption","node",["scripts/v09-provider-interruption-stress.mjs"]],
 ["Pass 5 - Cancellation + Control Races","node",["scripts/v09-control-race-stress.mjs"]],
 ["Pass 6 - Mixed Workload Endurance","node",["scripts/v09-mixed-endurance-stress.mjs"]],
 ["Failure Classification","node",["scripts/v09-failure-classification-regression.mjs"]],
 ["Failure Recovery Matrix","node",["scripts/v09-failure-matrix-regression.mjs"]],
 ["Observability Core","node",["scripts/v09-observability-regression.mjs"]],
 ["Observability Integration","node",["scripts/v09-observability-integration.mjs"]],
 ["v0.8 Intelligence","node",["scripts/v08-full-regression.mjs"]],
 ["v0.7 Security","node",["scripts/security-regression.mjs"]]
];

let passed=0,failed=0;
const results=[];

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 6 PASS 7");
console.log(" FULL DESTRUCTIVE-STRESS GATE");
console.log("============================================================");
console.log(`Suites: ${suites.length}`);
console.log("External AI calls expected: NONE");
console.log("GitHub publication expected: NONE");
console.log("Real child-process force kills: YES\n");

for(let i=0;i<suites.length;i++){
 const [name,command,args]=suites[i];

 console.log("\n============================================================");
 console.log(` [${i+1}/${suites.length}] ${name}`);
 console.log("============================================================");

 const isWindowsNpm=process.platform==="win32"&&command==="npm";
 const executable=isWindowsNpm?(process.env.ComSpec||"cmd.exe"):command;
 const executableArgs=isWindowsNpm?["/d","/s","/c","npm",...args]:args;
 const result=spawnSync(executable,executableArgs,{
  cwd:process.cwd(),
  stdio:"inherit",
  shell:false,
  env:process.env
 });

 const code=result.status??1;
 const ok=code===0;

 if(ok){
  passed++;
  console.log(`\nGATE PASS: ${name}`);
 }else{
  failed++;
  console.log(`\nGATE FAIL: ${name} (exit ${code})`);
 }

 results.push({name,code,ok});
}

console.log("\n============================================================");
console.log(" DATABASE POST-GATE CHECK");
console.log("============================================================");

let dbOk=true;

try{
 const {db}=await import("../dist/database/database.js");

 const integrity=db.prepare("PRAGMA integrity_check").get();
 const integrityValue=String(Object.values(integrity||{})[0]||"");

 console.log(`SQLite integrity_check: ${integrityValue}`);

 if(integrityValue.toLowerCase()!=="ok"){
  dbOk=false;
  console.log("FAIL SQLite integrity_check");
 }else{
  console.log("PASS SQLite integrity_check");
 }

 const foreignKeys=db.prepare("PRAGMA foreign_key_check").all();
 console.log(`Foreign-key violations: ${foreignKeys.length}`);

 if(foreignKeys.length){
  dbOk=false;
  console.log("FAIL SQLite foreign_key_check");
 }else{
  console.log("PASS SQLite foreign_key_check");
 }

 const leakedJobs=Number(db.prepare(`
  SELECT COUNT(*) count FROM jobs
  WHERE id LIKE 'b6p1_%'
     OR id LIKE 'b6p2_%'
     OR id LIKE 'b6p5_%'
     OR id LIKE 'b6p6_%'
 `).get()?.count||0);

 console.log(`Leaked Batch 6 synthetic jobs: ${leakedJobs}`);

 if(leakedJobs){
  dbOk=false;
  console.log("FAIL Batch 6 synthetic job cleanup");
 }else{
  console.log("PASS Batch 6 synthetic job cleanup");
 }

 const invalidRunning=Number(db.prepare(`
  SELECT COUNT(*) count FROM jobs
  WHERE status='running'
  AND (
   claimed_by IS NULL
   OR claimed_at IS NULL
   OR lease_expires_at IS NULL
   OR heartbeat_at IS NULL
  )
 `).get()?.count||0);

 console.log(`Running jobs with invalid ownership: ${invalidRunning}`);

 if(invalidRunning){
  dbOk=false;
  console.log("FAIL Running-job ownership integrity");
 }else{
  console.log("PASS Running-job ownership integrity");
 }

 const overBudget=Number(db.prepare(`
  SELECT COUNT(*) count FROM jobs
  WHERE attempts>max_attempts
 `).get()?.count||0);

 console.log(`Jobs beyond attempt budget: ${overBudget}`);

 if(overBudget){
  dbOk=false;
  console.log("FAIL Attempt-budget integrity");
 }else{
  console.log("PASS Attempt-budget integrity");
 }

}catch(error){
 dbOk=false;
 console.log(`FAIL Database post-gate check: ${error.message}`);
}

if(dbOk){
 passed++;
 results.push({name:"Database Post-Gate Integrity",code:0,ok:true});
}else{
 failed++;
 results.push({name:"Database Post-Gate Integrity",code:1,ok:false});
}

console.log("\n============================================================");
console.log(" BATCH 6 PASS 7 FINAL RESULTS");
console.log("============================================================");

for(const result of results){
 console.log(`${result.ok?"PASS":"FAIL"}  ${result.name}${result.ok?"":` [exit ${result.code}]`}`);
}

console.log("\n------------------------------------------------------------");
console.log(`Passed suites: ${passed}`);
console.log(`Failed suites: ${failed}`);
console.log(`Total gates:   ${passed+failed}`);
console.log("------------------------------------------------------------");

if(failed===0){
 console.log("\nBATCH 6 PASS 7 PASSED.");
 console.log("Queue/concurrency stress:          PASS");
 console.log("Worker-loss recovery:              PASS");
 console.log("Runtime crash/restart continuity:  PASS");
 console.log("Provider interruption recovery:    PASS");
 console.log("Cancellation/control races:        PASS");
 console.log("240-job mixed endurance:           PASS");
 console.log("Failure semantics:                 PASS");
 console.log("Observability:                     PASS");
 console.log("Intelligence regression:           PASS");
 console.log("Security regression:               PASS");
 console.log("Database integrity:                PASS");
 console.log("\nVEYLITH v0.9 BATCH 6 COMPLETE.");
 console.log("NEXT: v0.9 Batch 7 - Full Production Regression + v0.9.0 Promotion");
}else{
 console.log("\nBATCH 6 PASS 7 FAILED.");
 console.log("Do not promote v0.9 yet.");
 process.exitCode=1;
}




