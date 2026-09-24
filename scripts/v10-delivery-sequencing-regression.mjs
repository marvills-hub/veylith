import fs from"node:fs";
let passed=0,failed=0;
function check(name,value){
 if(value){console.log(`PASS ${name}`);passed++;}
 else{console.log(`FAIL ${name}`);failed++;}
}
const authority=fs.readFileSync("src/orchestration/v1/delivery-goal-authority.service.ts","utf8");
const delivery=fs.readFileSync("src/orchestration/v1/autonomous-delivery.service.ts","utf8");
const executor=fs.readFileSync("src/team/goal-role-executor.service.ts","utf8");

console.log("\nVEYLITH v1.0 BATCH 7.1B - DELIVERY SEQUENCING AUTHORITY\n");

check("authority reads real goal execution",authority.includes("goalExecutionState(goalId)"));
check("authority reads real goal graph",authority.includes("loadGoalTaskGraph(goalId)"));
check("delivery work identified explicitly",authority.includes("deliveryWorkItemId"));
check("delivery must be running",authority.includes('delivery.status==="running"'));
check("delivery excluded from prerequisite set",authority.includes("item.id!==deliveryWorkItemId"));
check("all prerequisites must complete",authority.includes('item.status!=="completed"'));
check("failed prerequisites detected",authority.includes('item.status==="failed"'));
check("cancelled prerequisites detected",authority.includes('item.status==="cancelled"'));
check("blocked prerequisites detected",authority.includes('item.status==="blocked"'));
check("authority exposes deterministic ready state",authority.includes("ready:"));
check("coordinator asserts pre-delivery authority",delivery.includes("assertPreDeliveryGoalAuthority"));
check("coordinator no longer uses execution.success",!delivery.includes("execution.success"));
check("readiness goal fact derives from authority",delivery.includes("goalComplete:authority.ready"));
check("readiness work fact derives from authority",delivery.includes("workComplete:authority.ready"));
check("executor passes actual work item",executor.includes("deliveryWorkItemId:managed.workItemId"));
check("delivery still uses Batch 6 readiness",delivery.includes("assessDeliveryReadiness"));
check("delivery still uses Batch 6 plan",delivery.includes("createAutonomousDeliveryPlan"));
check("delivery still uses Batch 6 commit",delivery.includes("prepareAutonomousDeliveryCommit"));
check("delivery still uses Batch 6 publication",delivery.includes("executeAutonomousPublication"));
check("delivery still verifies remote",delivery.includes("verifyAutonomousDelivery"));
check("delivery still records release",delivery.includes("recordVerifiedProjectRelease"));
check("legacy direct git remains absent",!executor.includes('../git/git.service.js'));
check("goal completion still occurs after role execution",executor.indexOf("const result=await executeRole")<executor.indexOf("const advanced=completeGoalTaskExecution(task.id)"));

console.log(`\n${passed}/${passed+failed} checks passed.`);
if(failed)process.exitCode=1;
