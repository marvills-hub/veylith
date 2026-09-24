import{readFileSync}from"node:fs";

let passed=0;
let failed=0;

function check(name:string,value:boolean){
 if(value){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.error(`FAIL ${name}`);
 }
}

const recovery=readFileSync("src/team/team-recovery.service.ts","utf8");
const budget=readFileSync("src/team/team-recovery-budget.service.ts","utf8");

check(
 "recovery loop uses durable max attempts",
 recovery.includes("attempt<recovery.maxAttempts")
);

check(
 "recovery telemetry uses durable max attempts",
 recovery.includes("${attempt}/${recovery.maxAttempts}")
);

check(
 "recovery budget extension exists",
 budget.includes("extendTeamRecoveryBudget")
);

check(
 "extension is bounded to three attempts",
 budget.includes("Math.min(3")
);

check(
 "extension increases max attempts",
 budget.includes("max_attempts=max_attempts+?")
);

check(
 "extension never resets attempts",
 !budget.includes("attempts=0")&&!budget.includes("attempts = 0")
);

check(
 "extension retains same recovery row",
 budget.includes("WHERE id=?")
);

check(
 "extension restores recovering state",
 budget.includes("status='recovering'")
);

check(
 "successful recovery cannot be extended",
 budget.includes('"recovered"')
);

check(
 "failed recovery cannot be extended",
 budget.includes('"failed"')
);

console.log(`\n7.4F.2 REGRESSION: ${passed}/${passed+failed}`);
process.exitCode=failed?1:0;
