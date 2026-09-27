import fs from"node:fs";
let passed=0,failed=0;
function check(name,value){
 if(value){console.log(`PASS ${name}`);passed++;}
 else{console.log(`FAIL ${name}`);failed++;}
}
const source=fs.readFileSync("src/team/team-recovery.service.ts","utf8");
check("repair execution is contained inside internal recovery loop",/try\s*\{[\s\S]*?repair=await repairProject\(/.test(source));
check("development application is contained with repair proposal",/repair=await repairProject\([\s\S]*?await applyDevelopment\([\s\S]*?\}\s*catch\(error\)/.test(source));
check("review rejection participates in recovery",source.includes("reviewRejected"));
check("rejected repair becomes validation evidence",/command:"repair-cycle"/.test(source));
check("rejected repair captures actual error",/stderr:repairError/.test(source));
check("rejected repair is appended to repair history",/history=\[\.\.\.history,rejected\]/.test(source));
check("rejected repair preserves repair attempt number",/const rejected:RepairHistoryItem=\{[\s\S]*?attempt,/.test(source));
check("rejected repair preserves diagnostic fingerprint",/fingerprint:diagnostic\.fingerprint/.test(source));
check("rejected repair persists failed attempt evidence",/saveAttempt\([\s\S]*?recovery\.id,[\s\S]*?attempt,[\s\S]*?diagnostic,[\s\S]*?validation,[\s\S]*?repairError/.test(source));
check("rejected repair emits telemetry",/"team\.repair_rejected"/.test(source));
check("rejected repair continues internal recovery loop",/"team\.repair_rejected"[\s\S]*?continue;/.test(source));
check("internal loop uses durable recovery budget",/while\([\s\S]*?attempt<recovery\.maxAttempts\)/.test(source));
check("successful repair synchronizes repository evolution",/const repairEvolution=synchronizeRepairEvolution/.test(source));
check("successful repair validates development",/validation=await validateDevelopment/.test(source));
check("review rejection can trigger re-review",/reviewRejected[\s\S]*?reviewProject/.test(source));
check("successful repair can finish recovered",/finish\(recovery\.id,"recovered"/.test(source));
check("true budget exhaustion remains terminal",/finish\(recovery\.id,"exhausted"/.test(source));
console.log(`\n7.4G REGRESSION: ${passed}/${passed+failed}`);
process.exitCode=fail?1:0;
