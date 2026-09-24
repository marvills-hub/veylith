import {spawnSync} from "node:child_process";

const scripts=[
 ["Pass 1","v10-team-assignment-regression.mjs"],
 ["Pass 2","v10-agent-handoff-regression.mjs"],
 ["Pass 3","v10-shared-context-regression.mjs"],
 ["Pass 4","v10-graph-team-execution-regression.mjs"],
 ["Pass 5","v10-real-worker-team-regression.mjs"],
 ["Pass 6","v10-team-recovery-regression.mjs"]
];

let failed=0;

console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 2 MASTER REGRESSION");
console.log("============================================================");

for(const [name,file] of scripts){
 console.log(`\n=== ${name}: ${file} ===`);
 const result=spawnSync(
  process.execPath,
  [`scripts/${file}`],
  {
   cwd:process.cwd(),
   stdio:"inherit",
   shell:false
  }
 );
 const code=result.status??1;
 console.log(`${name} exit: ${code}`);
 if(code!==0)failed++;
}

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 2 MASTER RESULT");
console.log("============================================================");
console.log(`Passes: ${scripts.length}`);
console.log(`Failed: ${failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 2 MASTER REGRESSION PASSED");
}else{
 console.error("\nVEYLITH v1.0 BATCH 2 MASTER REGRESSION FAILED");
 process.exitCode=1;
}
