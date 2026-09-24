import fs from "node:fs";

const recovery=fs.readFileSync("src/team/team-recovery.service.ts","utf8");
const diagnostic=fs.readFileSync("src/agent/diagnostic.service.ts","utf8");

let pass=0;
let fail=0;

function check(name:string,value:boolean){
 if(value){
  pass++;
  console.log(`PASS ${name}`);
 }else{
  fail++;
  console.log(`FAIL ${name}`);
 }
}

const callStart=recovery.indexOf("const diagnostic=await diagnoseFailure(");
const callEnd=recovery.indexOf(");",callStart);
const call=recovery.slice(callStart,callEnd+2);

const rejectStart=recovery.indexOf("const rejected:RepairHistoryItem={");
const rejectEnd=recovery.indexOf("continue;",rejectStart);
const reject=recovery.slice(rejectStart,rejectEnd+"continue;".length);

check("diagnostic call exists",callStart>=0&&callEnd>callStart);
check("diagnostic receives validation",call.includes("validation"));
check("diagnostic has no invented history argument",!call.includes("history"));
check("diagnostic loads project repair history",diagnostic.includes("const history=repairHistory(project.id);"));
check("diagnostic compares matching fingerprints",diagnostic.includes("history.filter(item=>item.fingerprint===fingerprint)"));
check("diagnostic incorporates previous files",diagnostic.includes("history.flatMap(item=>item.files||[])"));
check("rejected repair becomes validation evidence",reject.includes('command:"repair-cycle"'));
check("rejected repair enters local history",reject.includes("history=[...history,rejected]"));
check("rejected repair enters team_repair memory",reject.includes('"team_repair"'));
check("rejected diagnostic is durable",reject.includes("diagnostic:{"));
check("rejected repair payload is durable",reject.includes("repair:{"));
check("rejected validation is durable",reject.includes("validation:rejected.validation"));
check("rejected marker is durable",reject.includes("rejected:true"));
check("rejected telemetry remains",reject.includes('"team.repair_rejected"'));
check("rejected cycle continues internally",reject.includes("continue;"));
check("pre-repair fingerprint captured",recovery.includes("const beforeRepairFingerprint=diagnostic.fingerprint;"));
check("post-repair fingerprint captured",recovery.includes("const afterRepairFingerprint=failureFingerprint(validation);"));
check("progress requires fingerprint transition",recovery.includes("afterRepairFingerprint!==beforeRepairFingerprint"));
check("old failure can become resolved",/fingerprint:beforeRepairFingerprint[\s\S]*?outcome:"resolved"/.test(recovery));
check("new failure can become unresolved",/fingerprint:afterRepairFingerprint[\s\S]*?outcome:"unresolved"/.test(recovery));
check("progress telemetry exists",recovery.includes('"team.repair_progressed"'));
check("durable budget remains authority",recovery.includes("attempt<recovery.maxAttempts"));
check("successful recovery remains terminal",recovery.includes('finish(recovery.id,"recovered"'));
check("true exhaustion remains terminal",recovery.includes('finish(recovery.id,"exhausted"'));

console.log(`\n7.4H.6 REGRESSION: ${pass}/${pass+fail}`);
process.exitCode=fail?1:0;
