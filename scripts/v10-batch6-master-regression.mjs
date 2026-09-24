import{spawnSync}from"node:child_process";
import fs from"node:fs";

const gates=[
 ["6.1 Delivery Readiness","scripts/v10-delivery-readiness-regression.mjs"],
 ["6.2 Delivery Plan","scripts/v10-delivery-plan-regression.mjs"],
 ["6.3 Delivery Commit","scripts/v10-delivery-commit-regression.mjs"],
 ["6.4 Publication","scripts/v10-delivery-publication-regression.mjs"],
 ["6.4 Production Guard","scripts/v10-delivery-publication-integration.mjs"],
 ["6.5 Verification + Recovery","scripts/v10-delivery-verification-regression.mjs"],
 ["6.5 Production Guard","scripts/v10-delivery-verification-integration.mjs"],
 ["6.6 Release History","scripts/v10-release-history-regression.mjs"],
 ["6.6 Production Guard","scripts/v10-release-history-integration.mjs"]
];

let passed=0;
let failed=0;
const results=[];

function run(name,file){
 if(!fs.existsSync(file)){
  failed++;
  results.push({name,file,code:-1});
  console.error(`FAIL ${name}: missing ${file}`);
  return;
 }
 console.log("");
 console.log("============================================================");
 console.log(` ${name}`);
 console.log("============================================================");
 const result=spawnSync(
  process.execPath,
  [file],
  {
   cwd:process.cwd(),
   env:process.env,
   encoding:"utf8"
  }
 );
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 const code=result.status??1;
 if(code===0){
  passed++;
  console.log(`MASTER PASS ${name}`);
 }else{
  failed++;
  console.error(`MASTER FAIL ${name} (${code})`);
 }
 results.push({name,file,code});
}

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 6 MASTER DELIVERY REGRESSION");
console.log("============================================================");

for(const[name,file]of gates)run(name,file);

console.log("");
console.log("============================================================");
console.log(" BATCH 6 MASTER SUMMARY");
console.log("============================================================");

for(const result of results){
 console.log(
  `${result.code===0?"PASS":"FAIL"} ${result.name}`
 );
}

console.log("");
console.log(`Master gates passed: ${passed}`);
console.log(`Master gates failed: ${failed}`);
console.log(`Master gates total:  ${passed+failed}`);

if(failed===0){
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 MASTER REGRESSION PASSED");
}else{
 console.log("");
 console.log("VEYLITH v1.0 BATCH 6 MASTER REGRESSION FAILED");
}

process.exitCode=failed===0?0:1;
