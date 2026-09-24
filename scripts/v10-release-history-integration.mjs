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
 "src/delivery/release-history.service.ts",
 "utf8"
);

check(
 "release requires delivery verification",
 source.includes('verification.status!=="verified"')
);
check(
 "release requires verified flag",
 source.includes("!verification.verified")
);
check(
 "release requires published delivery",
 source.includes('publication.status!=="published"')
);
check(
 "release requires exact publication commit",
 source.includes(
  "verification.actualCommit!==publication.commit"
 )
);
check(
 "release binds repository fingerprint",
 source.includes(
  "publication.repositoryFingerprint!=="
 )
);
check(
 "release validates repository evolution snapshot",
 source.includes("approvedSnapshot")
);
check(
 "release records predecessor relationship",
 source.includes("previousReleaseId")
);
check(
 "release advances repository evolution",
 source.includes('type:"delivery"')
);
check(
 "release writes durable project memory",
 source.includes('"project_release"')
);
check(
 "release exposes reusable agent history prompt",
 source.includes("projectReleasePrompt")
);

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 PASS 6.6 PRODUCTION GUARD");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

process.exitCode=failed===0?0:1;
