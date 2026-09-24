import fs from "node:fs";

let pass=0;
let fail=0;

function check(name:string,value:boolean){
 if(value){
  pass++;
  console.log(`PASS ${name}`);
 }else{
  fail++;
  console.log(`FAIL ${name}`);
 }
}

const source=fs.readFileSync(
 "src/team/team-recovery.service.ts",
 "utf8"
);

check(
 "repair execution is contained inside internal recovery loop",
 /try\s*\{[\s\S]*?repair=await repairProject\(/.test(source)
);

check(
 "development application is contained with repair proposal",
 /repair=await repairProject\([\s\S]*?await applyDevelopment\([\s\S]*?\}\s*catch\(error\)/.test(source)
);

check(
 "rejected repair becomes validation evidence",
 /command:"repair-cycle"/.test(source)
);

check(
 "rejected repair captures actual error",
 /stderr:repairError/.test(source)
);

check(
 "rejected repair is appended to repair history",
 /history=\[\.\.\.history,rejected\]/.test(source)
);

check(
 "rejected repair preserves repair attempt number",
 /const rejected:RepairHistoryItem=\{[\s\S]*?attempt,/.test(source)
);

check(
 "rejected repair preserves diagnostic fingerprint",
 /fingerprint:diagnostic\.fingerprint/.test(source)
);

check(
 "rejected repair persists failed attempt evidence",
 /saveAttempt\([\s\S]*?recovery\.id,[\s\S]*?attempt,[\s\S]*?diagnostic,[\s\S]*?validation,[\s\S]*?repairError/.test(source)
);

check(
 "rejected repair emits telemetry",
 /"team\.repair_rejected"/.test(source)
);

check(
 "rejected repair continues internal recovery loop",
 /"team\.repair_rejected"[\s\S]*?continue;/.test(source)
);

check(
 "internal loop still uses durable recovery budget",
 /while\(!validation\.success&&attempt<recovery\.maxAttempts\)/.test(source)
);

check(
 "successful repair still synchronizes repository evolution",
 /const repairEvolution=synchronizeRepairEvolution/.test(source)
);

check(
 "successful repair still validates development",
 /validation=await validateDevelopment/.test(source)
);

check(
 "successful repair can still finish recovered",
 /finish\(recovery\.id,"recovered"/.test(source)
);

check(
 "true budget exhaustion remains terminal",
 /finish\(recovery\.id,"exhausted"/.test(source)
);

console.log(`\n7.4G REGRESSION: ${pass}/${pass+fail}`);
process.exitCode=fail?1:0;
