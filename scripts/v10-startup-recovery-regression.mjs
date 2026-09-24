import fs from"node:fs";
let passed=0,failed=0;
function check(name,value){
 if(value){console.log(`PASS ${name}`);passed++;}
 else{console.log(`FAIL ${name}`);failed++;}
}
const startup=fs.readFileSync("src/orchestration/v1/lifecycle/lifecycle-startup.service.ts","utf8");
const recovery=fs.readFileSync("src/orchestration/v1/lifecycle/lifecycle-recovery.service.ts","utf8");
const repo=fs.readFileSync("src/orchestration/v1/lifecycle/lifecycle.repository.ts","utf8");
const server=fs.readFileSync("src/server.ts","utf8");

console.log("\nVEYLITH v1.0 BATCH 7.1D - PRODUCTION STARTUP RECOVERY\n");

check("startup recovery service exists",startup.includes("recoverV1AutonomousStartup"));
check("startup recovery delegates lifecycle recovery",startup.includes("recoverAutonomousLifecycles()"));
check("startup recovery has completion guard",startup.includes("startupRecoveryCompleted"));
check("startup recovery has concurrency guard",startup.includes("startupRecoveryRunning"));
check("completed recovery skips duplicate execution",startup.includes("if(startupRecoveryCompleted)"));
check("concurrent recovery skips duplicate execution",startup.includes("if(startupRecoveryRunning)"));
check("startup recovery records completion",startup.includes("startupRecoveryCompleted=true"));
check("startup recovery emits telemetry",startup.includes("orchestrator.v1_startup_recovery_completed"));
check("startup recovery logs failures",startup.includes("startup recovery failed"));
check("startup running flag cleared finally",startup.includes("finally"));
check("server imports v1 startup recovery",server.includes("recoverV1AutonomousStartup"));
check("server awaits v1 startup recovery",server.includes("await recoverV1AutonomousStartup();"));
check("runtime registers before v1 recovery",
 server.indexOf("registerRuntime();")<server.indexOf("await recoverV1AutonomousStartup();"));
check("legacy interrupted task recovery precedes v1 recovery",
 server.indexOf("recoverInterruptedTasks();")<server.indexOf("await recoverV1AutonomousStartup();"));
check("worker slots initialize before v1 recovery",
 server.indexOf("initializeWorkerSlots();")<server.indexOf("await recoverV1AutonomousStartup();"));
check("v1 recovery precedes runtime heartbeat",
 server.indexOf("await recoverV1AutonomousStartup();")<server.indexOf("startRuntimeHeartbeat();"));
check("v1 recovery precedes HTTP listen",
 server.indexOf("await recoverV1AutonomousStartup();")<server.indexOf("app.listen"));
check("v1 recovery precedes worker startup",
 server.indexOf("await recoverV1AutonomousStartup();")<server.indexOf("void runWorker();"));
check("existing AI recovery preserved",server.includes("resumePausedAIJobs()"));
check("existing worker loop preserved",server.includes("workerLoop()"));
check("existing runtime job release preserved",server.includes("releaseRuntimeJobs("));
check("lifecycle recovery reads durable checkpoints",recovery.includes("listRecoverableLifecycles"));
check("lifecycle recovery synchronizes goal state",recovery.includes("synchronizeGoalExecution"));
check("recoverable states remain durable",repo.includes("status IN('running','waiting','delivering')"));

console.log(`\n${passed}/${passed+failed} checks passed.`);
if(failed)process.exitCode=1;
