import{spawnSync}from"node:child_process";
import path from"node:path";

const root=process.cwd();

const gates=[
 {
  id:"5.1",
  name:"Persistent Repository Evolution Model",
  script:"scripts/v10-repository-evolution-regression.mjs",
  expected:22
 },
 {
  id:"5.2",
  name:"Architectural Decision & Knowledge Memory",
  script:"scripts/v10-project-knowledge-regression.mjs",
  expected:27
 },
 {
  id:"5.3",
  name:"Repository Convention Learning",
  script:"scripts/v10-repository-convention-regression.mjs",
  expected:24
 },
 {
  id:"5.4",
  name:"Historical Change + Failure Intelligence",
  script:"scripts/v10-failure-history-regression.mjs",
  expected:22
 },
 {
  id:"5.5",
  name:"Evolution-Aware Agent Context",
  script:"scripts/v10-evolution-context-regression.mjs",
  expected:29
 },
 {
  id:"5.6",
  name:"Automatic Repository Learning Lifecycle",
  script:"scripts/v10-repository-learning-lifecycle-regression.mjs",
  expected:22
 }
];

function run(command,args){
 return spawnSync(command,args,{
  cwd:root,
  stdio:"inherit",
  shell:false,
  env:{...process.env}
 });
}

function nodeCommand(){
 return process.execPath;
}

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 5 PASS 5.7");
console.log(" REPOSITORY EVOLUTION + MEMORY MASTER REGRESSION");
console.log("============================================================");
console.log("");

let passed=0;
let failed=0;
const results=[];

for(const gate of gates){
 console.log("");
 console.log("============================================================");
 console.log(` GATE ${gate.id} — ${gate.name.toUpperCase()}`);
 console.log("============================================================");

 const result=run(
  nodeCommand(),
  [path.resolve(root,gate.script)]
 );

 const code=
  typeof result.status==="number"
   ?result.status
   :1;

 const ok=code===0;

 results.push({
  ...gate,
  code,
  ok
 });

 if(ok){
  passed++;
  console.log("");
  console.log(
   `MASTER PASS ${gate.id} — ${gate.name} (${gate.expected} checks)`
  );
 }else{
  failed++;
  console.log("");
  console.error(
   `MASTER FAIL ${gate.id} — ${gate.name} (exit ${code})`
  );
 }
}

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 5 MASTER SUMMARY");
console.log("============================================================");

for(const result of results){
 console.log(
  `${result.ok?"PASS":"FAIL"} ${result.id} `+
  `${result.name} — expected ${result.expected} checks`
 );
}

const expectedChecks=gates.reduce(
 (total,gate)=>total+gate.expected,
 0
);

console.log("");
console.log(`Gates passed:          ${passed}`);
console.log(`Gates failed:          ${failed}`);
console.log(`Total gates:           ${gates.length}`);
console.log(`Expected checks:       ${expectedChecks}`);
console.log("");

if(failed===0){
 console.log("VEYLITH v1.0 BATCH 5 MASTER REGRESSION PASSED");
 console.log("");
 console.log("Repository evolution:              VERIFIED");
 console.log("Snapshot parent history:            VERIFIED");
 console.log("Architectural knowledge memory:     VERIFIED");
 console.log("Knowledge supersession:             VERIFIED");
 console.log("Repository convention learning:     VERIFIED");
 console.log("Historical failure intelligence:    VERIFIED");
 console.log("Successful repair recall:           VERIFIED");
 console.log("Evolution-aware agent context:      VERIFIED");
 console.log("Role-scoped historical context:     VERIFIED");
 console.log("Production context integration:     VERIFIED");
 console.log("Automatic repository learning:      VERIFIED");
 console.log("Automatic convention refresh:       VERIFIED");
 console.log("Repair evolution capture:           VERIFIED");
 console.log("Verified repair learning:           VERIFIED");
 console.log("Persistent project memory:          VERIFIED");
 console.log("Project isolation:                  VERIFIED");
 console.log("Restart persistence:                VERIFIED");
}else{
 console.error("VEYLITH v1.0 BATCH 5 MASTER REGRESSION FAILED");
}

process.exitCode=failed===0?0:1;
