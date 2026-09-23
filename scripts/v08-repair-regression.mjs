import assert from "node:assert/strict";
import {createRepairScope,validateRepairScope} from "../dist/intelligence/repair-scope.service.js";

const task={prompt:"Fix todo persistence test isolation"};
const plan={
 summary:"",
 architecture:[],
 files:[
  {path:"src/todo.service.ts",purpose:"todo persistence"},
  {path:"tests/todo.test.ts",purpose:"todo tests"}
 ],
 commands:[]
};
const diagnostic={
 summary:"Persistent test data leaks between tests",
 rootCause:"Tests reuse persistent todo storage without cleanup",
 evidence:["Second test observes records created by first test"],
 relevantFiles:["tests/todo.test.ts","src/todo.service.ts"],
 previousAttempts:[],
 strategy:["isolate test storage"],
 avoid:["do not weaken assertions"],
 confidence:"high",
 fingerprint:"abc123"
};

const focused=createRepairScope(task,plan,diagnostic,[]);
assert.equal(focused.expansion,"focused");
assert.equal(focused.repeatedFailures,0);
assert.ok(focused.allowedFiles.includes("tests/todo.test.ts"));
assert.ok(focused.allowedFiles.includes("src/todo.service.ts"));

const good={
 summary:"fix isolation",
 files:[{path:"tests/todo.test.ts",content:"x"}],
 commands:[]
};
const goodValidation=validateRepairScope(focused,good);
assert.equal(goodValidation.allowed,true);

const bad={
 summary:"rewrite unrelated areas",
 files:[
  {path:"tests/todo.test.ts",content:"x"},
  {path:"src/auth.service.ts",content:"x"}
 ],
 commands:[]
};
const badValidation=validateRepairScope(focused,bad);
assert.equal(badValidation.allowed,false);
assert.ok(badValidation.outsideScope.includes("src/auth.service.ts"));

const history1=[{
 attempt:1,
 summary:"first repair",
 files:["tests/todo.test.ts"],
 validation:{},
 fingerprint:"abc123"
}];
const expanded=createRepairScope(task,plan,{...diagnostic,confidence:"medium"},history1);
assert.equal(expanded.expansion,"expanded");
assert.equal(expanded.repeatedFailures,1);

const history2=[
 ...history1,
 {
  attempt:2,
  summary:"second repair",
  files:["src/todo.service.ts"],
  validation:{},
  fingerprint:"abc123"
 }
];
const broad=createRepairScope(task,plan,{...diagnostic,confidence:"high"},history2);
assert.equal(broad.expansion,"broad");
assert.equal(broad.repeatedFailures,2);

const broadResult={
 summary:"broader root cause repair",
 files:[
  {path:"tests/todo.test.ts",content:"x"},
  {path:"src/todo.service.ts",content:"x"},
  {path:"src/storage.service.ts",content:"x"}
 ],
 commands:[]
};
assert.equal(validateRepairScope(broad,broadResult).allowed,true);

console.log("PASS focused repair scope");
console.log("PASS unrelated focused repair rejected");
console.log("PASS repeated failure expands repair scope");
console.log("PASS resistant failure permits broader investigation");
console.log("VEYLITH v0.8 BATCH 4 REPAIR SCOPE TEST PASSED");
