import {spawnSync} from "node:child_process";

const npm=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):"npm";
const node=process.execPath;

const suites=[
 ["Pass 1 — Foundation","scripts/v09-dashboard-foundation-regression.mjs"],
 ["Pass 2 — Task Control","scripts/v09-dashboard-task-control-regression.mjs"],
 ["Pass 3 — Autonomous Team","scripts/v09-dashboard-team-regression.mjs"],
 ["Pass 4 — Operations","scripts/v09-dashboard-operations-regression.mjs"],
 ["Pass 5 — Publication","scripts/v09-dashboard-publication-regression.mjs"],
 ["Pass 6 — SSE Reliability","scripts/v09-dashboard-sse-regression.mjs"],
 ["Pass 7 — Full Integration","scripts/v09-dashboard-full-regression.mjs"]
];

function run(command,args){
 const result=spawnSync(command,args,{
  stdio:"inherit",
  shell:false,
  env:process.env
 });
 return result.status??1;
}

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 5 FINAL RELEASE GATE");
console.log("============================================================\n");

console.log("=== TYPESCRIPT BUILD ===\n");

const buildCode=process.platform==="win32"
 ?run(npm,["/d","/s","/c","npm run build"])
 :run(npm,["run","build"]);

const results=[];

for(const [name,file] of suites){
 console.log(`\n=== ${name.toUpperCase()} ===\n`);
 const code=run(node,[file]);
 results.push({name,file,code});
}

console.log("\n============================================================");
console.log(" BATCH 5 RELEASE SUMMARY");
console.log("============================================================");
console.log(`Build                         ${buildCode===0?"PASS":"FAIL"} (${buildCode})`);

for(const result of results){
 console.log(
  `${result.name.padEnd(29)} ${result.code===0?"PASS":"FAIL"} (${result.code})`
 );
}

const failed=buildCode!==0||results.some(result=>result.code!==0);

console.log("------------------------------------------------------------");

if(failed){
 console.log("BATCH 5 STATUS                FAILED");
 console.log("Fix the failing gate before Batch 6.");
 process.exitCode=1;
}else{
 console.log("BATCH 5 STATUS                COMPLETE");
 console.log("");
 console.log("Dashboard foundation          PASS");
 console.log("Task / worker controls        PASS");
 console.log("Autonomous team monitoring    PASS");
 console.log("Operations observability      PASS");
 console.log("Git / GitHub monitoring       PASS");
 console.log("SSE reliability               PASS");
 console.log("Stale / offline detection     PASS");
 console.log("No synthetic telemetry        PASS");
 console.log("");
 console.log("VEYLITH v0.9 BATCH 5 COMPLETE.");
 console.log("NEXT: v0.9 BATCH 6 — Stress / Restart / Failure Testing");
}
