import fs from"node:fs";
let passed=0,failed=0;
function check(name,value){
 if(value){console.log(`PASS ${name}`);passed++;}
 else{console.log(`FAIL ${name}`);failed++;}
}
const executor=fs.readFileSync("src/team/goal-role-executor.service.ts","utf8");
const delivery=fs.readFileSync("src/orchestration/v1/autonomous-delivery.service.ts","utf8");

console.log("\nVEYLITH v1.0 BATCH 7.1A - PRODUCTION DELIVERY BRIDGE\n");

check("legacy initializeGit import removed",!executor.includes('initializeGit,publishToGitHub'));
check("legacy publishToGitHub import removed",!executor.includes('../git/git.service.js'));
check("v1 delivery coordinator imported",executor.includes("executeV1AutonomousDelivery"));
check("delivery role uses v1 coordinator",executor.includes("return executeV1AutonomousDelivery"));
check("delivery requires goal-managed task",executor.includes("v1 autonomous delivery requires a goal-managed task"));
check("coordinator checks goal authority",delivery.includes("assertPreDeliveryGoalAuthority"));
check("coordinator requires validation",delivery.includes("validation?.success"));
check("coordinator requires review approval",delivery.includes("review?.approved"));
check("coordinator assesses readiness",delivery.includes("assessDeliveryReadiness"));
check("coordinator creates delivery plan",delivery.includes("createAutonomousDeliveryPlan"));
check("coordinator prepares exact commit",delivery.includes("prepareAutonomousDeliveryCommit"));
check("coordinator publishes through Batch 6",delivery.includes("executeAutonomousPublication"));
check("coordinator verifies publication",delivery.includes("verifyAutonomousDelivery"));
check("coordinator records release history",delivery.includes("recordVerifiedProjectRelease"));
check("coordinator requires remote verification",delivery.includes("github?.verified"));
check("coordinator requires remote commit",delivery.includes("github?.commit"));
check("coordinator records telemetry",delivery.includes("orchestrator.v1_delivery_completed"));
check("no direct Git service in coordinator",!delivery.includes("../git/git.service"));
check("no direct GitHub service in coordinator",!delivery.includes("../git/github.service"));
check("team architecture route preserved",executor.includes("executeArchitect"));
check("team planner route preserved",executor.includes("executePlanner"));
check("team developer route preserved",executor.includes("executeDeveloper"));
check("team tester route preserved",executor.includes("executeTester"));
check("team reviewer route preserved",executor.includes("executeReviewer"));
check("goal advancement preserved",executor.includes("completeGoalTaskExecution(task.id)"));
check("development synchronization preserved",executor.includes("synchronizeTaskDevelopment(task.id)"));
check("team recovery preserved",executor.includes("recoverGoalWork"));
check("repository learning preserved",executor.includes("synchronizeRepositoryLearning"));
check("agent project context preserved",executor.includes("buildAgentProjectContext"));

console.log(`\n${passed}/${passed+failed} checks passed.`);
if(failed)process.exitCode=1;

