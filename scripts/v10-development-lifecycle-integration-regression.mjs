import fs from "node:fs";
import process from "node:process";

let passed=0;
let failed=0;

function check(name,value){
 if(value){
  console.log(`PASS ${name}`);
  passed++;
 }else{
  console.log(`FAIL ${name}`);
  failed++;
 }
}

const lifecycle=fs.readFileSync(
 "src/development/development-lifecycle.service.ts",
 "utf8"
);
const role=fs.readFileSync(
 "src/team/goal-role-executor.service.ts",
 "utf8"
);
const runner=fs.readFileSync(
 "src/jobs/job-runner.service.ts",
 "utf8"
);
const recovery=fs.readFileSync(
 "src/core/recovery.service.ts",
 "utf8"
);

check(
 "lifecycle coordinator exists",
 fs.existsSync("src/development/development-lifecycle.service.ts")
);
check(
 "task maps through persistent goal dispatch",
 lifecycle.includes("goal_work_dispatches")
);
check(
 "task lifecycle resolves project goal",
 lifecycle.includes("project_goals")
);
check(
 "existing development sessions reused",
 lifecycle.includes("development_sessions")
);
check(
 "missing session initializes automatically",
 lifecycle.includes("initializeDevelopmentSession(goalId)")
);
check(
 "goal lifecycle synchronizes milestone state",
 lifecycle.includes("synchronizeDevelopmentSession(session.id)")
);
check(
 "task lifecycle synchronization exported",
 lifecycle.includes("export function synchronizeTaskDevelopment")
);
check(
 "restart recovery exported",
 lifecycle.includes("export function recoverActiveDevelopmentSessions")
);
check(
 "restart recovery selects recoverable non-terminal sessions",
 lifecycle.includes("WHERE status IN ('active','paused')")
);
check(
 "restart delegates to session recovery",
 lifecycle.includes("recoverDevelopmentSession(row.project_id)")
);
check(
 "role executor imports lifecycle coordinator",
 role.includes("development-lifecycle.service.js")
);
check(
 "work preparation triggers lifecycle synchronization",
 /prepareGoalTaskExecution\(task\.id\);\s*synchronizeTaskDevelopment\(task\.id\);/.test(role)
);
check(
 "resumed completed work synchronizes lifecycle",
 /roleResult\.status==="completed"[\s\S]*?completeGoalTaskExecution\(task\.id\);\s*synchronizeTaskDevelopment\(task\.id\);/.test(role)
);
check(
 "normal work completion synchronizes lifecycle",
 /const advanced=completeGoalTaskExecution\(task\.id\);\s*synchronizeTaskDevelopment\(task\.id\);/.test(role)
);
check(
 "job runner imports lifecycle coordinator",
 runner.includes("development-lifecycle.service.js")
);
check(
 "terminal graph failure synchronizes lifecycle",
 /failGoalTaskExecution\(job\.task_id,"failed"\);\s*synchronizeTaskDevelopment\(job\.task_id\);/.test(runner)
);
check(
 "startup recovery imports lifecycle coordinator",
 recovery.includes("development-lifecycle.service.js")
);
check(
 "startup recovery invokes development recovery",
 recovery.includes("recoverActiveDevelopmentSessions()")
);
check(
 "legacy task execution remains present",
 runner.includes("await executeTask(task)")
);
check(
 "goal team execution remains present",
 runner.includes("await executeGoalTeamTask(task)")
);

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 3 PASS 2");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 2 STATIC INTEGRATION PASSED");
}else{
 console.log("\nVEYLITH v1.0 BATCH 3 PASS 2 NOT YET CLOSED");
}

process.exitCode=failed===0?0:1;

