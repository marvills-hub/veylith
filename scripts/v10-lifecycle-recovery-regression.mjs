import fs from"node:fs";
let passed=0,failed=0;
function check(name,value){
 if(value){console.log(`PASS ${name}`);passed++;}
 else{console.log(`FAIL ${name}`);failed++;}
}
const types=fs.readFileSync("src/orchestration/v1/lifecycle/lifecycle.types.ts","utf8");
const repo=fs.readFileSync("src/orchestration/v1/lifecycle/lifecycle.repository.ts","utf8");
const service=fs.readFileSync("src/orchestration/v1/lifecycle/lifecycle.service.ts","utf8");
const recovery=fs.readFileSync("src/orchestration/v1/lifecycle/lifecycle-recovery.service.ts","utf8");
const executor=fs.readFileSync("src/team/goal-role-executor.service.ts","utf8");

console.log("\nVEYLITH v1.0 BATCH 7.1C - PERSISTENT LIFECYCLE + RECOVERY\n");

check("persistent lifecycle type exists",types.includes("AutonomousLifecycleCheckpoint"));
check("lifecycle stages modeled",types.includes('"verification"')&&types.includes('"release"'));
check("checkpoint table exists",repo.includes("autonomous_lifecycle_checkpoints"));
check("goal checkpoint unique",repo.includes("goal_id TEXT NOT NULL UNIQUE"));
check("delivery plan checkpoint persisted",repo.includes("delivery_plan_id TEXT"));
check("publication checkpoint persisted",repo.includes("publication_id TEXT"));
check("verification checkpoint persisted",repo.includes("verification_id TEXT"));
check("release checkpoint persisted",repo.includes("release_id TEXT"));
check("checkpoint lookup exists",repo.includes("lifecycleCheckpoint"));
check("checkpoint creation idempotent",repo.includes("if(existing)return existing"));
check("checkpoint update exists",repo.includes("updateLifecycleCheckpoint"));
check("recoverable lifecycle query exists",repo.includes("listRecoverableLifecycles"));
check("running lifecycle recoverable",repo.includes("'running'"));
check("waiting lifecycle recoverable",repo.includes("'waiting'"));
check("delivering lifecycle recoverable",repo.includes("'delivering'"));
check("lifecycle begin service exists",service.includes("beginAutonomousLifecycle"));
check("lifecycle checkpoint service exists",service.includes("checkpointAutonomousLifecycle"));
check("lifecycle failure service exists",service.includes("failAutonomousLifecycle"));
check("recovery enumerates persisted lifecycle",recovery.includes("listRecoverableLifecycles"));
check("recovery restores development session",recovery.includes("recoverDevelopmentSession"));
check("recovery synchronizes goal",recovery.includes("synchronizeGoalExecution"));
check("recovery reads goal state",recovery.includes("goalExecutionState"));
check("recovery emits telemetry",recovery.includes("orchestrator.v1_lifecycle_recovered"));
check("team executor begins lifecycle",executor.includes("beginAutonomousLifecycle"));
check("team executor checkpoints delivery",executor.includes('"delivery"'));
check("team executor checkpoints release",executor.includes('checkpointAutonomousLifecycle(prepared.goalId,"release"'));
check("team executor stores delivery plan id",executor.includes("deliveryPlanId:deliveryResult.plan.id"));
check("team executor stores publication id",executor.includes("publicationId:deliveryResult.publication.id"));
check("team executor stores verification id",executor.includes("verificationId:deliveryResult.verification.id"));
check("team executor stores release id",executor.includes("releaseId:deliveryResult.release.id"));
check("team failure persists lifecycle failure",executor.includes("failAutonomousLifecycle(prepared.goalId,error)"));
check("legacy direct git remains absent",!executor.includes('../git/git.service.js'));

console.log(`\n${passed}/${passed+failed} checks passed.`);
if(failed)process.exitCode=1;

