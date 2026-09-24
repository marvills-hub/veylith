import fs from"node:fs";

let passed=0;
let failed=0;

function source(file){
 return fs.readFileSync(file,"utf8");
}
function check(name,value){
 if(value){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.error(`FAIL ${name}`);
 }
}

const readiness=source(
 "src/delivery/delivery-readiness.service.ts"
);
const planning=source(
 "src/delivery/delivery-plan.service.ts"
);
const commit=source(
 "src/delivery/delivery-commit.service.ts"
);
const publication=source(
 "src/delivery/delivery-publication.service.ts"
);
const verification=source(
 "src/delivery/delivery-verification.service.ts"
);
const release=source(
 "src/delivery/release-history.service.ts"
);
const releaseRepo=source(
 "src/delivery/release-history.repository.ts"
);
const releaseContext=source(
 "src/delivery/release-context.service.ts"
);

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 CROSS-STAGE INTEGRITY");
console.log("============================================================");

check(
 "delivery planning depends on readiness authority",
 planning.includes("readiness")
);

check(
 "delivery manifest locks repository fingerprint",
 planning.includes("repositoryFingerprint")
);

check(
 "commit preparation requires planned delivery",
 commit.includes('status!=="planned"')||
 commit.includes('status !== "planned"')
);

const commitStart=commit.indexOf(
 "export async function prepareAutonomousDeliveryCommit"
);
const commitEnd=commit.indexOf(
 "export function assertPreparedDeliveryCommitCurrent"
);
const commitExecution=
 commitStart>=0
  ?commit.slice(
    commitStart,
    commitEnd>commitStart?commitEnd:undefined
   )
  :"";

check(
 "commit preparation checks repository freshness before Git",
 commitExecution.includes(
  "assertDeliveryPlanRepositoryCurrent"
 )&&
 commitExecution.includes(
  "initializeGit"
 )&&
 commitExecution.indexOf(
  "assertDeliveryPlanRepositoryCurrent"
 )<
 commitExecution.indexOf(
  "initializeGit"
 )
);

check(
 "commit preparation locks resulting commit SHA",
 commit.includes("afterHead")
);

check(
 "publication requires current prepared commit",
 publication.includes(
  "assertPreparedDeliveryCommitCurrent"
 )
);

const executeStart=publication.indexOf(
 "export async function executeAutonomousPublication"
);
const executeEnd=publication.indexOf(
 "export function assertPublicationAuthorizationCurrent"
);
const execution=
 executeStart>=0
  ?publication.slice(
    executeStart,
    executeEnd>executeStart?executeEnd:undefined
   )
  :"";

check(
 "publication rechecks SHA before hardened publisher",
 execution.includes(
  "assertPreparedDeliveryCommitCurrent(plan.id)"
 )&&
 execution.includes(
  "publishToGitHub(input.task,input.project)"
 )&&
 execution.indexOf(
  "assertPreparedDeliveryCommitCurrent(plan.id)"
 )<
 execution.indexOf(
  "publishToGitHub(input.task,input.project)"
 )
);

check(
 "publication delegates to hardened GitHub publisher",
 publication.includes(
  "publishToGitHub(input.task,input.project)"
 )
);

check(
 "verification consumes hardened publication recovery state",
 verification.includes("getPublicationRecoveryState")
);

check(
 "verification compares expected and observed remote SHA",
 verification.includes("actual!==expected")
);

check(
 "remote SHA mismatch blocks autonomous delivery",
 verification.includes('status:"blocked"')&&
 verification.includes('recoveryAction:"manual"')
);

check(
 "verified delivery becomes durable verified state",
 verification.includes('status:"verified"')&&
 verification.includes("verified:true")
);

check(
 "release requires verified delivery",
 release.includes('verification.status!=="verified"')&&
 release.includes("!verification.verified")
);

check(
 "release requires published publication",
 release.includes('publication.status!=="published"')
);

check(
 "release requires exact verified publication SHA",
 release.includes(
  "verification.actualCommit!==publication.commit"
 )
);

check(
 "release requires manifest fingerprint binding",
 release.includes(
  "publication.repositoryFingerprint!=="
 )
);

check(
 "release resolves approved repository evolution snapshot",
 release.includes("findRepositoryEvolutionSnapshot")
);

check(
 "release advances repository evolution",
 release.includes('type:"delivery"')
);

check(
 "release history records predecessor",
 release.includes("previousReleaseId")&&
 release.includes("previousCommit")
);

check(
 "release history is uniquely bound to delivery plan",
 releaseRepo.includes(
  "delivery_plan_id TEXT NOT NULL UNIQUE"
 )
);

check(
 "release history is uniquely bound to publication",
 releaseRepo.includes(
  "publication_id TEXT NOT NULL UNIQUE"
 )
);

check(
 "release history is uniquely bound to verification",
 releaseRepo.includes(
  "verification_id TEXT NOT NULL UNIQUE"
 )
);

check(
 "release sequence is unique per project",
 releaseRepo.includes(
  "UNIQUE(project_id,sequence)"
 )
);

check(
 "release writes durable project memory",
 release.includes('"project_release"')
);

check(
 "future agent context can consume release history",
 releaseContext.includes("projectReleasePrompt")&&
 releaseContext.includes("listProjectReleases")
);

check(
 "readiness has no GitHub side effect",
 !readiness.includes("publishToGitHub")
);

check(
 "planning has no GitHub side effect",
 !planning.includes("publishToGitHub")
);

check(
 "verification has no direct GitHub publication side effect",
 !verification.includes("publishToGitHub")
);

check(
 "release history has no GitHub publication side effect",
 !release.includes("publishToGitHub")
);

console.log("");
console.log("============================================================");
console.log(" CROSS-STAGE SUMMARY");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 CROSS-STAGE INTEGRITY PASSED");
}else{
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 CROSS-STAGE INTEGRITY FAILED");
}

process.exitCode=failed===0?0:1;

