import {spawnSync} from "node:child_process";

const tests=[
 ["Batch 4 integration","scripts/v09-git-integration-regression.mjs"],
 ["Batch 4 real Git","scripts/v09-git-real-recovery-regression.mjs"],
 ["Batch 4 recovery","scripts/v09-git-recovery-regression.mjs"],
 ["Batch 4 safety","scripts/v09-git-safety-regression.mjs"],
 ["Batch 3 failure classification","scripts/v09-failure-classification-regression.mjs"],
 ["Batch 3 failure semantics","scripts/v09-failure-recovery-regression.mjs"],
 ["Batch 3 recovery matrix","scripts/v09-failure-matrix-regression.mjs"],
 ["Batch 2 observability core","scripts/v09-observability-regression.mjs"],
 ["Batch 2 observability integration","scripts/v09-observability-integration.mjs"],
 ["v0.8 intelligence","scripts/v08-full-regression.mjs"],
 ["v0.7 security","scripts/security-regression.mjs"]
];

let failed=0;

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 4 FINAL REGRESSION");
console.log("============================================================");

for(const [name,file] of tests){
 console.log(`\n=== ${name.toUpperCase()} ===`);

 const result=spawnSync(
  process.execPath,
  [file],
  {
   cwd:process.cwd(),
   stdio:"inherit",
   env:process.env
  }
 );

 const code=result.status??1;

 console.log(`\n${name}: ${code===0?"PASS":"FAIL"} (${code})`);

 if(code!==0)failed++;
}

console.log("\n============================================================");
console.log(" BATCH 4 FINAL REGRESSION SUMMARY");
console.log("============================================================");
console.log(`Suites passed: ${tests.length-failed}/${tests.length}`);
console.log(`Suites failed: ${failed}/${tests.length}`);

process.exitCode=failed?1:0;

