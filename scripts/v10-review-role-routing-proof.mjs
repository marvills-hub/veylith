import {roleForWorkKind} from "../src/team/team-role.service.js";

const cases=[
 ["architecture","architect"],
 ["analysis","planner"],
 ["implementation","developer"],
 ["integration","developer"],
 ["test","tester"],
 ["review","reviewer"],
 ["documentation","documentation"],
 ["delivery","delivery"],
 ["other","developer"]
];

let failed=0;

for(const [kind,expected] of cases){
 const actual=roleForWorkKind(kind);
 if(actual===expected){
  console.log(`PASS ${kind} -> ${actual}`);
 }else{
  console.log(`FAIL ${kind} -> ${actual}, expected ${expected}`);
  failed++;
 }
}

if(failed){
 console.log(`ROLE ROUTING FAILURES: ${failed}`);
 process.exitCode=1;
}else{
 console.log("ROLE ROUTING: PASS");
}
