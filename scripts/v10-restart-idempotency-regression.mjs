import fs from"node:fs";
let passed=0,failed=0;
function check(name,value){
 if(value){console.log(`PASS ${name}`);passed++;}
 else{console.log(`FAIL ${name}`);failed++;}
}

const startup=fs.readFileSync("src/orchestration/v1/lifecycle/lifecycle-startup.service.ts","utf8");
const recovery=fs.readFileSync("src/orchestration/v1/lifecycle/lifecycle-recovery.service.ts","utf8");
const repo=fs.readFileSync("src/orchestration/v1/lifecycle/lifecycle.repository.ts","utf8");
const executor=fs.readFileSync("src/team/goal-role-executor.service.ts","utf8");
const delivery=fs.readFileSync("src/orchestration/v1/autonomous-delivery.service.ts","utf8");

console.log("\nVEYLITH v1.0 BATCH 7.1D - RESTART / IDEMPOTENCY SAFETY\n");

check("startup executes lifecycle recovery once per process",
 startup.includes("startupRecoveryCompleted=true"));
check("second startup recovery is skipped",
 startup.includes("if(startupRecoveryCompleted)"));
check("overlapping startup recovery is skipped",
 startup.includes("if(startupRecoveryRunning)"));
check("checkpoint creation remains idempotent",
 repo.includes("if(existing)return existing"));
check("one checkpoint per goal enforced",
 repo.includes("goal_id TEXT NOT NULL UNIQUE"));
check("only unfinished lifecycles selected",
 repo.includes("WHERE status IN('running','waiting','delivering')"));
check("completed lifecycle excluded from recovery query",
 !repo.includes("WHERE status IN('running','waiting','delivering','completed')"));
check("recovery synchronizes existing goal instead of recreating goal",
 recovery.includes("synchronizeGoalExecution(lifecycle.goalId)"));
check("recovery does not bootstrap another project",
 !recovery.includes("bootstrapAutonomousProject"));
check("recovery does not directly execute team role",
 !recovery.includes("executeGoalTeamTask"));
check("recovery does not publish to GitHub",
 !recovery.includes("publishToGitHub"));
check("recovery does not invoke delivery publication",
 !recovery.includes("executeAutonomousPublication"));
check("recovery does not create delivery plan",
 !recovery.includes("createAutonomousDeliveryPlan"));
check("recovery does not prepare another commit",
 !recovery.includes("prepareAutonomousDeliveryCommit"));
check("production delivery remains behind role execution",
 executor.includes("executeV1AutonomousDelivery"));
check("delivery still requires pre-delivery authority",
 delivery.includes("assertPreDeliveryGoalAuthority"));
check("delivery publication remains Batch 6 controlled",
 delivery.includes("executeAutonomousPublication"));
check("delivery verification remains required",
 delivery.includes("verifyAutonomousDelivery"));
check("release recording remains after verification",
 delivery.indexOf("verifyAutonomousDelivery")<delivery.indexOf("recordVerifiedProjectRelease"));

console.log(`\n${passed}/${passed+failed} checks passed.`);
if(failed)process.exitCode=1;
