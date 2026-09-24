import fs from"node:fs";

let failures=0;
function check(name:string,ok:boolean){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(!ok)failures++;
}

const startup=fs.readFileSync(
 "src/orchestration/v1/lifecycle/lifecycle-startup.service.ts",
 "utf8"
);
const repo=fs.readFileSync(
 "src/jobs/job.repository.ts",
 "utf8"
);

check("startup recovery bridge exists",startup.includes("recoverExhaustedAutonomousRepairs"));
check("failed job is required",startup.includes("j.status='failed'"));
check("outer attempts must be exhausted",startup.includes("j.attempts>=j.max_attempts"));
check("team repair budget must remain",startup.includes("tr.attempts<tr.max_attempts"));
check("terminal repair states are excluded",startup.includes("'recovered','failed','blocked','exhausted'"));
check("job attempt count is never reset",!startup.includes("attempts=0"));
check("existing job receives one bounded extension",startup.includes("extendJobForAutonomousRecovery(candidate.jobId,1)"));
check("task becomes recoverable queued work",startup.includes("phase='recovering'"));
check("goal work becomes ready",startup.includes("SET status='ready'"));
check("assignment becomes assigned",startup.includes("SET status='assigned'"));
check("project returns to autonomous development",startup.includes("phase='autonomous_development'"));
const startupFunction=startup.slice(startup.indexOf("export async function recoverV1AutonomousStartup"));
check(
 "startup invokes lifecycle recovery first",
 startupFunction.indexOf("recoverAutonomousLifecycles()")>=0&&
 startupFunction.indexOf("recoverExhaustedAutonomousRepairs()")>=0&&
 startupFunction.indexOf("recoverAutonomousLifecycles()")<
 startupFunction.indexOf("recoverExhaustedAutonomousRepairs()")
);
check("recovery emits durable telemetry",startup.includes("orchestrator.v1_exhausted_repair_recovered"));
check("repository extension preserves attempts",repo.includes("max_attempts=max_attempts+?"));
check("repository extension does not reset attempts",!repo.includes("SET attempts=0"));

console.log(`7.4E.3 REGRESSION: ${15-failures}/15`);
process.exitCode=failures?1:0;

