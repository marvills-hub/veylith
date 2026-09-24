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
 "src/delivery/delivery-publication.service.ts",
 "utf8"
);

const executionStart=source.indexOf(
 "export async function executeAutonomousPublication"
);
const executionEnd=source.indexOf(
 "export async function assertPublicationAuthorizationCurrent"
);
const execution=
 executionStart>=0
  ?source.slice(
    executionStart,
    executionEnd>executionStart?executionEnd:source.length
   )
  :"";

const preparedRecheck=execution.indexOf(
 "assertPreparedDeliveryCommitCurrent(plan.id)"
);
const publishCall=execution.indexOf(
 "publishToGitHub(input.task,input.project)"
);

check(
 "publication service uses prepared commit authority",
 source.includes("assertPreparedDeliveryCommitCurrent")
);
check(
 "publication service delegates to hardened GitHub publisher",
 source.includes("publishToGitHub")
);
check(
 "prepared commit is rechecked before publication",
 preparedRecheck>=0&&
 publishCall>=0&&
 preparedRecheck<publishCall
);
check(
 "publication validates project ownership",
 execution.includes("Delivery plan belongs to another project")
);
check(
 "publication validates workspace",
 execution.includes(
  "Publication workspace does not match delivery plan"
 )
);
check(
 "publication validates approved repository identity",
 execution.includes("repository slug does not match")
);
check(
 "publication persists publishing state",
 execution.includes('status:"publishing"')
);
check(
 "publication persists published state",
 execution.includes('status:"published"')
);
check(
 "publication records failures",
 execution.includes('status:"failed"')
);
check(
 "successful publication closes delivery plan",
 execution.includes(
  'setDeliveryPlanStatus(plan.id,"delivered")'
 )
);

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 PASS 6.4 PRODUCTION GUARD");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

process.exitCode=failed===0?0:1;
