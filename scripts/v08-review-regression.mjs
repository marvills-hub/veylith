import assert from "node:assert/strict";
import {buildReviewEvidence} from "../dist/intelligence/review-evidence.service.js";
import {finalizeReview} from "../dist/intelligence/review-decision.service.js";

const architecture={
 summary:"Todo API",
 stack:["Node"],
 structure:["src"],
 decisions:[],
 risks:[]
};
const plan={
 summary:"Modify todo service",
 architecture:[],
 files:[
  {path:"src/todo.service.ts",purpose:"implement todo behavior"},
  {path:"tests/todo.test.ts",purpose:"validate todo behavior"}
 ],
 commands:[
  {command:"npm",args:["test"],purpose:"tests"}
 ]
};
const development={
 summary:"Implemented todo behavior",
 files:[
  {path:"src/todo.service.ts",content:"export const todo=true;"},
  {path:"tests/todo.test.ts",content:"test('todo',()=>{});"}
 ],
 commands:[
  {command:"npm",args:["test"],purpose:"tests"}
 ]
};
const validation={
 success:true,
 results:[
  {command:"npm",args:["test"],code:0,stdout:"PASS",stderr:""}
 ]
};

const evidence=buildReviewEvidence(
 "Fix todo behavior",
 architecture,
 plan,
 development,
 validation,
 ["src/todo.service.ts","tests/todo.test.ts"]
);

assert.equal(evidence.validationPassed,true);
assert.equal(evidence.blocking,0);
assert.equal(evidence.changedFiles.length,2);
assert.equal(evidence.modifiedFiles.length,2);

const approved=finalizeReview(evidence,{
 approved:true,
 summary:"Looks correct",
 issues:[],
 recommendations:["Optional cleanup"]
});
assert.equal(approved.approved,true);
assert.equal(approved.issues.length,0);
assert.equal(approved.recommendations.length,1);

const failedValidation=buildReviewEvidence(
 "Fix todo behavior",
 architecture,
 plan,
 development,
 {
  success:false,
  results:[
   {command:"npm",args:["test"],code:1,stdout:"",stderr:"FAIL"}
  ],
  failure:{command:"npm",args:["test"],code:1}
 },
 ["src/todo.service.ts","tests/todo.test.ts"]
);
assert.equal(failedValidation.blocking,1);

const aiWronglyApproves=finalizeReview(failedValidation,{
 approved:true,
 summary:"Looks fine",
 issues:[],
 recommendations:[]
});
assert.equal(aiWronglyApproves.approved,false);
assert.ok(aiWronglyApproves.issues.some(issue=>issue.includes("validation-failed")));

const duplicateDevelopment={
 ...development,
 files:[
  {path:"src/todo.service.ts",content:"a"},
  {path:"src/todo.service.ts",content:"b"}
 ]
};
const duplicateEvidence=buildReviewEvidence(
 "Fix todo behavior",
 architecture,
 plan,
 duplicateDevelopment,
 validation,
 ["src/todo.service.ts"]
);
assert.ok(duplicateEvidence.findings.some(item=>item.code==="duplicate-output"));
assert.ok(duplicateEvidence.blocking>0);

const emptyDevelopment={
 ...development,
 files:[
  {path:"src/todo.service.ts",content:""}
 ]
};
const emptyEvidence=buildReviewEvidence(
 "Fix todo behavior",
 architecture,
 plan,
 emptyDevelopment,
 validation,
 ["src/todo.service.ts"]
);
assert.ok(emptyEvidence.findings.some(item=>item.code==="empty-file"));
assert.ok(emptyEvidence.blocking>0);

const aiRejects=finalizeReview(evidence,{
 approved:false,
 summary:"Requirement incomplete",
 issues:["Missing required behavior"],
 recommendations:[]
});
assert.equal(aiRejects.approved,false);
assert.ok(aiRejects.issues.includes("Missing required behavior"));

console.log("PASS successful implementation can be approved");
console.log("PASS failed validation cannot be AI-approved");
console.log("PASS duplicate output is blocking");
console.log("PASS empty generated file is blocking");
console.log("PASS AI correctness issue blocks approval");
console.log("PASS recommendations remain non-blocking");
console.log("VEYLITH v0.8 BATCH 5 REVIEW TEST PASSED");
