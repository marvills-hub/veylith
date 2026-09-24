import assert from"node:assert/strict";
import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{db}from"../dist/database/database.js";
import{captureRepositoryEvolution}from"../dist/evolution/repository-evolution.service.js";
import{deleteRepositoryEvolutionProject,listRepositoryEvolutionEvents}from"../dist/evolution/repository-evolution.repository.js";
import{
 rememberFailureResolution,
 recallFailureHistory,
 failureHistoryState,
 failureHistoryPrompt
}from"../dist/intelligence/history/failure-history.service.js";
import{recordValidationFailureHistory}from"../dist/intelligence/history/validation-history.service.js";
import{
 findFailureHistory,
 listFailureHistory,
 deleteFailureHistoryByProject
}from"../dist/intelligence/history/failure-history.repository.js";

let passed=0;
let failed=0;
async function check(name,fn){
 try{await fn();passed++;console.log(`PASS ${name}`);}
 catch(error){failed++;console.error(`FAIL ${name}`);console.error(error);}
}

const suffix=crypto.randomUUID().replace(/-/g,"").slice(0,10);
const projectId=`p54_project_${suffix}`;
const otherProjectId=`p54_other_${suffix}`;
const taskId=`p54_task_${suffix}`;
const workspace=path.join(process.cwd(),"workspaces",`.v10-p54-${suffix}`);
const time=new Date().toISOString();

function columns(table){
 return(db.prepare(`PRAGMA table_info(${table})`).all()).map(row=>String(row.name));
}
function insertAdaptive(table,values){
 const available=columns(table);
 const selected=Object.keys(values).filter(key=>available.includes(key));
 db.prepare(`INSERT INTO ${table}(${selected.join(",")}) VALUES(${selected.map(()=>"?").join(",")})`)
  .run(...selected.map(key=>values[key]));
}

for(const id of[projectId,otherProjectId]){
 insertAdaptive("projects",{
  id,name:id,slug:id,status:"active",progress:0,workspace,
  phase:"development",created_at:time,updated_at:time
 });
}
insertAdaptive("tasks",{
 id:taskId,project_id:projectId,title:"Pass 5.4 fixture",
 prompt:"Learn from historical failures.",status:"running",
 phase:"development",priority:0,attempts:1,max_attempts:3,
 repair_attempts:0,created_at:time,updated_at:time
});

fs.mkdirSync(path.join(workspace,"src"),{recursive:true});
fs.writeFileSync(path.join(workspace,"package.json"),JSON.stringify({name:`p54-${suffix}`,version:"1.0.0"},null,2));
fs.writeFileSync(path.join(workspace,"src","user.service.ts"),"export const user=true;\n");

const baseline=captureRepositoryEvolution({projectId,taskId,workspace});
const fingerprint="jest:user-service:expected-1-received-2";

let resolved;

await check("resolved historical failure can be recorded",async()=>{
 resolved=rememberFailureResolution({
  projectId,taskId,fingerprint,
  failureKind:"test",
  summary:"User service returned duplicate result.",
  rootCause:"Shared test fixture was not reset between tests.",
  relevantFiles:["src/user.service.ts","src/user.service.spec.ts"],
  repairFiles:["src/user.service.spec.ts"],
  strategy:["reset fixture in beforeEach","rerun focused test"],
  repairAttemptId:"repair_fixture_1",
  verificationId:"verify_fixture_1",
  beforeRunId:"run_before_1",
  afterRunId:"run_after_1",
  outcome:"resolved",
  evidence:["original fingerprint disappeared","previous passing checks remained passing"]
 });
 assert.equal(resolved.outcome,"resolved");
});

await check("history binds latest repository snapshot",async()=>{
 assert.equal(resolved.snapshotId,baseline.snapshot.id);
});

await check("history creates repository evolution event",async()=>{
 assert.ok(resolved.evolutionEventId);
 const events=listRepositoryEvolutionEvents(projectId,100);
 assert.ok(events.some(event=>event.id===resolved.evolutionEventId));
});

await check("root cause persists",async()=>{
 const saved=findFailureHistory(projectId,fingerprint,"resolved");
 assert.match(saved.rootCause,/fixture was not reset/);
});

await check("repair files persist deterministically",async()=>{
 const saved=findFailureHistory(projectId,fingerprint,"resolved");
 assert.deepEqual(saved.repairFiles,["src/user.service.spec.ts"]);
});

await check("repair strategy persists",async()=>{
 const saved=findFailureHistory(projectId,fingerprint,"resolved");
 assert.equal(saved.strategy.length,2);
});

await check("exact historical failure can be recalled",async()=>{
 const match=recallFailureHistory(projectId,fingerprint);
 assert.equal(match.exact,true);
 assert.equal(match.record.fingerprint,fingerprint);
});

await check("resolved history with root cause is useful",async()=>{
 const match=recallFailureHistory(projectId,fingerprint);
 assert.equal(match.useful,true);
});

await check("unknown fingerprint returns no historical match",async()=>{
 assert.equal(recallFailureHistory(projectId,"unknown:fingerprint"),null);
});

await check("repeated same resolved fingerprint increments occurrence count",async()=>{
 rememberFailureResolution({
  projectId,taskId,fingerprint,
  failureKind:"test",
  summary:"User service returned duplicate result.",
  rootCause:"Shared test fixture was not reset between tests.",
  repairFiles:["src/user.service.spec.ts"],
  outcome:"resolved"
 });
 const saved=findFailureHistory(projectId,fingerprint,"resolved");
 assert.equal(saved.occurrences,2);
});

await check("repeated fingerprint does not duplicate same outcome history row",async()=>{
 const rows=listFailureHistory(projectId,100).filter(row=>row.fingerprint===fingerprint&&row.outcome==="resolved");
 assert.equal(rows.length,1);
});

await check("unresolved outcome remains distinct from successful historical fix",async()=>{
 const unresolved=rememberFailureResolution({
  projectId,taskId,fingerprint,
  failureKind:"test",
  summary:"Failure reproduced before repair.",
  rootCause:"Shared test fixture contamination.",
  outcome:"unresolved"
 });
 assert.equal(unresolved.outcome,"unresolved");
 assert.notEqual(unresolved.id,resolved.id);
});

await check("regression outcome can be learned",async()=>{
 const record=recordValidationFailureHistory({
  projectId,taskId,
  fingerprint:"lint:repair-regression",
  failureKind:"lint",
  summary:"Repair fixed original issue but introduced lint regression.",
  diagnostic:{
   rootCause:"Repair introduced an unused import.",
   relevantFiles:["src/user.service.ts"],
   strategy:["remove unused import"],
   evidence:["lint failure"]
  },
  repair:{id:"repair_regression",files:["src/user.service.ts"]},
  verification:{
   id:"verify_regression",
   beforeRunId:"before_regression",
   afterRunId:"after_regression",
   originalResolved:true,
   regressionFree:false
  }
 });
 assert.equal(record.outcome,"regressed");
});

await check("successful verification becomes resolved history",async()=>{
 const record=recordValidationFailureHistory({
  projectId,taskId,
  fingerprint:"typecheck:missing-return",
  failureKind:"typecheck",
  summary:"Function lacked required return value.",
  diagnostic:{
   rootCause:"Implementation omitted return statement.",
   relevantFiles:["src/user.service.ts"],
   strategy:["restore return value"]
  },
  repair:{id:"repair_return",files:["src/user.service.ts"]},
  verification:{
   id:"verify_return",
   beforeRunId:"before_return",
   afterRunId:"after_return",
   originalResolved:true,
   regressionFree:true
  }
 });
 assert.equal(record.outcome,"resolved");
});

await check("blocked failure history can be recorded without source repair",async()=>{
 const record=recordValidationFailureHistory({
  projectId,taskId,
  fingerprint:"infrastructure:timeout",
  failureKind:"infrastructure",
  summary:"Validation infrastructure unavailable.",
  blocked:true
 });
 assert.equal(record.outcome,"blocked");
 assert.equal(record.repairFiles.length,0);
});

await check("failure state summarizes historical outcomes",async()=>{
 const state=failureHistoryState(projectId);
 assert.ok(state.total>=5);
 assert.ok(state.resolved>=2);
 assert.ok(state.unresolved>=1);
 assert.ok(state.regressed>=1);
 assert.ok(state.blocked>=1);
});

await check("agent-ready historical prompt includes prior successful fix",async()=>{
 const prompt=failureHistoryPrompt(projectId);
 assert.match(prompt,/HISTORICAL FAILURE INTELLIGENCE/);
 assert.match(prompt,/Shared test fixture was not reset/);
 assert.match(prompt,/src\/user\.service\.spec\.ts/);
});

await check("failure history writes project memory",async()=>{
 const rows=db.prepare("SELECT type FROM project_memory WHERE project_id=?").all(projectId);
 assert.ok(rows.some(row=>String(row.type)==="failure_history"));
});

await check("history survives service reload boundary",async()=>{
 const saved=findFailureHistory(projectId,"typecheck:missing-return","resolved");
 assert.equal(saved.outcome,"resolved");
 assert.equal(saved.repairAttemptId,"repair_return");
});

await check("project histories remain isolated",async()=>{
 rememberFailureResolution({
  projectId:otherProjectId,
  fingerprint:"other:failure",
  failureKind:"test",
  summary:"Other project failure.",
  outcome:"unresolved"
 });
 assert.equal(recallFailureHistory(projectId,"other:failure"),null);
});

await check("repository evolution captures historical repair knowledge",async()=>{
 const events=listRepositoryEvolutionEvents(projectId,100);
 assert.ok(events.some(event=>event.type==="repair"));
});

await check("failure cleanup removes project history",async()=>{
 deleteFailureHistoryByProject(projectId);
 assert.equal(listFailureHistory(projectId,100).length,0);
});

deleteFailureHistoryByProject(otherProjectId);
deleteRepositoryEvolutionProject(projectId);
db.prepare("DELETE FROM project_memory WHERE project_id IN(?,?)").run(projectId,otherProjectId);
db.prepare("DELETE FROM tasks WHERE id=?").run(taskId);
db.prepare("DELETE FROM projects WHERE id IN(?,?)").run(projectId,otherProjectId);
fs.rmSync(workspace,{recursive:true,force:true});

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 5 PASS 5.4");
console.log(" HISTORICAL CHANGE + FAILURE INTELLIGENCE");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("");
console.log(failed===0
 ?"VEYLITH v1.0 BATCH 5 PASS 5.4 PASSED"
 :"VEYLITH v1.0 BATCH 5 PASS 5.4 NOT YET CLOSED");
process.exitCode=failed===0?0:1;
