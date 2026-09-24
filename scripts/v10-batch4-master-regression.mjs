import{spawnSync}from"node:child_process";

const gates=[
 ["4.1","Validation Strategy Engine","scripts/v10-validation-strategy-regression.mjs"],
 ["4.2","Validation Evidence & Failure Classification","scripts/v10-validation-evidence-regression.mjs"],
 ["4.3","Autonomous Diagnostic Loop","scripts/v10-autonomous-diagnostic-regression.mjs"],
 ["4.4","Targeted Repair Execution","scripts/v10-targeted-repair-regression.mjs"],
 ["4.5","Repair Verification & Regression Protection","scripts/v10-repair-verification-regression.mjs"],
 ["4.6","Unrecoverable Failure & Escalation Control","scripts/v10-validation-escalation-regression.mjs"]
];

function run(command,args=[]){
 const executable=process.platform==="win32"
  ?process.env.ComSpec||"cmd.exe"
  :command;

 const commandArgs=process.platform==="win32"
  ?["/d","/s","/c",command,...args]
  :args;

 return spawnSync(
  executable,
  commandArgs,
  {
   cwd:process.cwd(),
   stdio:"inherit",
   shell:false,
   env:process.env
  }
 );
}

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 4 PASS 4.7");
console.log(" MASTER VALIDATION + REPAIR REGRESSION");
console.log("============================================================");

let passed=0;
let failed=0;
const results=[];

for(const[pass,name,file]of gates){
 console.log("");
 console.log("------------------------------------------------------------");
 console.log(` PASS ${pass} — ${name}`);
 console.log("------------------------------------------------------------");

 const result=run("node",[file]);
 const code=result.status??1;
 const ok=code===0;

 results.push({
  pass,
  name,
  file,
  code,
  ok
 });

 if(ok){
  passed++;
  console.log(`MASTER PASS ${pass}`);
 }else{
  failed++;
  console.error(`MASTER FAIL ${pass} exit=${code}`);
 }
}

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 4 MASTER SUMMARY");
console.log("============================================================");

for(const result of results){
 console.log(
  `${result.ok?"PASS":"FAIL"} ${result.pass} ${result.name}`
 );
}

console.log("");
console.log(`Gates passed: ${passed}`);
console.log(`Gates failed: ${failed}`);
console.log(`Total gates:  ${results.length}`);
console.log("");

if(failed===0){
 console.log("VEYLITH v1.0 BATCH 4 MASTER REGRESSION PASSED");
 console.log("");
 console.log("Validation strategy:                 VERIFIED");
 console.log("Validation evidence persistence:     VERIFIED");
 console.log("Failure classification:              VERIFIED");
 console.log("Autonomous diagnosis:                VERIFIED");
 console.log("Diagnostic reuse:                    VERIFIED");
 console.log("Targeted repair execution:           VERIFIED");
 console.log("Repair scope escalation:             VERIFIED");
 console.log("Protected repair application:        VERIFIED");
 console.log("Repair verification:                 VERIFIED");
 console.log("Regression protection:               VERIFIED");
 console.log("Repair budget enforcement:           VERIFIED");
 console.log("Unchanged failure-loop detection:    VERIFIED");
 console.log("Regression-loop detection:           VERIFIED");
 console.log("Infrastructure blocking:             VERIFIED");
 console.log("Provider blocking:                   VERIFIED");
 console.log("Persistent escalation state:         VERIFIED");
}else{
 console.log("VEYLITH v1.0 BATCH 4 MASTER REGRESSION FAILED");
}

process.exitCode=failed===0?0:1;
