import{spawnSync}from"node:child_process";

const gates=[
 ["Pass 1 - Persistent Development Sessions","scripts/v10-development-session-regression.mjs"],
 ["Pass 2A - Lifecycle Integration","scripts/v10-development-lifecycle-integration-regression.mjs"],
 ["Pass 2B - Lifecycle Behavior","scripts/v10-development-lifecycle-behavior-regression.mjs"],
 ["Pass 3.1 - Development Cycles","scripts/v10-development-cycle-regression.mjs"],
 ["Pass 3.2 - Continuation Evaluator","scripts/v10-continuation-evaluator-regression.mjs"],
 ["Pass 3.3 - Safe Goal Expansion","scripts/v10-goal-expansion-regression.mjs"],
 ["Pass 3.4 - Continuation Orchestration","scripts/v10-continuation-orchestration-regression.mjs"],
 ["Pass 3.5 - AI Autonomous Replanner","scripts/v10-autonomous-replanner-regression.mjs"],
 ["Pass 3.6 - Restart / Persistence","scripts/v10-development-restart-regression.mjs"]
];

let passed=0;
let failed=0;

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 3 MASTER REGRESSION");
console.log(" LONG-RUNNING PROJECT DEVELOPMENT");
console.log("============================================================");

for(const[name,file]of gates){
 console.log(`\n=== ${name.toUpperCase()} ===`);
 const result=spawnSync(
  process.execPath,
  [file],
  {
   cwd:process.cwd(),
   stdio:"inherit",
   env:{...process.env}
  }
 );
 if(result.status===0){
  passed++;
  console.log(`MASTER PASS ${name}`);
 }else{
  failed++;
  console.log(`MASTER FAIL ${name} (${result.status})`);
 }
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 3 MASTER RESULT");
console.log("============================================================");
console.log(`Gates passed: ${passed}`);
console.log(`Gates failed: ${failed}`);
console.log(`Total gates:  ${gates.length}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 3 MASTER REGRESSION PASSED");
 console.log("Persistent development sessions:      VERIFIED");
 console.log("Automatic lifecycle integration:      VERIFIED");
 console.log("Persistent development cycles:        VERIFIED");
 console.log("Continuation evaluation:              VERIFIED");
 console.log("Safe DAG expansion:                   VERIFIED");
 console.log("Continuation orchestration:           VERIFIED");
 console.log("AI autonomous replanning:             VERIFIED");
 console.log("Deterministic AI safety boundary:      VERIFIED");
 console.log("Restart / persistence continuity:     VERIFIED");
 console.log("Legacy lifecycle isolation:           VERIFIED");
}else{
 console.log("\nVEYLITH v1.0 BATCH 3 MASTER REGRESSION NOT YET CLOSED");
 process.exitCode=1;
}
