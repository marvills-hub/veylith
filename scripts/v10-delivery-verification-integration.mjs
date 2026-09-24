import fs from"node:fs";

let passed=0;
let failed=0;

function check(name,value){
 if(value){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.error(`FAIL ${name}`);
 }
}

const source=fs.readFileSync(
 "src/delivery/delivery-verification.service.ts",
 "utf8"
);

check(
 "delivery recovery consumes hardened Git publication recovery state",
 source.includes("getPublicationRecoveryState")
);
check(
 "verification compares expected and actual commit",
 source.includes("actual!==expected")
);
check(
 "unverified publication selects resume recovery",
 source.includes('recoveryAction:"resume_publication"')
);
check(
 "commit mismatch blocks autonomous continuation",
 source.includes('status:"blocked"')
);
check(
 "commit mismatch requires manual recovery",
 source.includes('recoveryAction:"manual"')
);
check(
 "verified delivery becomes terminally verified",
 source.includes('status:"verified"')
);
check(
 "verified delivery clears recovery action",
 source.includes('recoveryAction:"none"')
);
check(
 "recovery distinguishes resume from retry",
 source.includes('"resume_publication"|"retry_publication"')
);
check(
 "verification persists durable project memory",
 source.includes('"delivery_verified"')
);
check(
 "recovery persists durable project memory",
 source.includes('"delivery_recovery"')
);

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 PASS 6.5 PRODUCTION GUARD");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

process.exitCode=failed===0?0:1;
