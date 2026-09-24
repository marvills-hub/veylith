import fs from"node:fs";

let failures=0;
function check(name:string,ok:boolean){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok)failures++;
}

const pipeline=fs.readFileSync("src/orchestration/pipeline.service.ts","utf8");
const scope=fs.readFileSync("src/intelligence/repair-scope.service.ts","utf8");
const runner=fs.readFileSync("src/jobs/job-runner.service.ts","utf8");
const repo=fs.readFileSync("src/jobs/job.repository.ts","utf8");

check("generated package integrity guard exists",pipeline.includes("assertGeneratedContentIntegrity"));
check("package json is parsed before acceptance",pipeline.includes("JSON.parse(content)"));
check("invalid package json becomes deterministic error",pipeline.includes("Generated package.json is invalid JSON"));
check("focused scope recognizes allowed files",scope.includes("!scope.allowedFiles.includes(changed)"));
check("planned files remain part of allowed scope",scope.includes("...plannedFiles"));
check("repair guard still rejects suspicious changes",scope.includes("Targeted repair guard rejected implementation"));
check("bounded job extension primitive exists",repo.includes("extendJobForAutonomousRecovery"));
check("extension increases max attempts rather than resetting attempts",repo.includes("max_attempts=max_attempts+?"));
check("extension never rewrites attempts to zero",!repo.includes("SET attempts=0"));
check("runner reads team recovery authority",runner.includes("recoverableTeamRepair"));
check("recovery requires attempts below recovery max",runner.includes("attempts>=maxAttempts"));
check("only goal managed exhaustion can enter recovery extension",runner.includes("exhausted&&")&&runner.includes("isGoalManagedTask(job.task_id)"));
check("recovery continuation emits telemetry",runner.includes("job.autonomous_recovery_extended"));
check("normal terminal failure remains",runner.includes("failGoalTaskExecution(job.task_id"));
check("provider retryable wait remains",runner.includes('classification.kind==="provider_retryable"'));

console.log(`7.4E REGRESSION: ${15-failures}/15`);
process.exitCode=failures?1:0;
