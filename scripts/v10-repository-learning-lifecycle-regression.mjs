import assert from"node:assert/strict";
import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{db}from"../dist/database/database.js";
import{captureRepositoryEvolution}from"../dist/evolution/repository-evolution.service.js";
import{
 synchronizeRepositoryLearning,
 synchronizeRepairEvolution,
 rememberRecoveryOutcome
}from"../dist/evolution/repository-learning-lifecycle.service.js";
import{repositoryEvolutionState}from"../dist/evolution/repository-evolution.service.js";
import{listRepositoryConventions,deleteRepositoryConventionsByProject}from"../dist/conventions/repository-convention.repository.js";
import{recallFailureHistory}from"../dist/intelligence/history/failure-history.service.js";
import{deleteFailureHistoryByProject}from"../dist/intelligence/history/failure-history.repository.js";
import{deleteRepositoryEvolutionProject}from"../dist/evolution/repository-evolution.repository.js";

let passed=0;
let failed=0;

async function check(name,fn){
 try{
  await fn();
  passed++;
  console.log(`PASS ${name}`);
 }catch(error){
  failed++;
  console.error(`FAIL ${name}`);
  console.error(error);
 }
}

const suffix=crypto.randomUUID().replace(/-/g,"").slice(0,10);
const projectId=`p56_project_${suffix}`;
const taskId=`p56_task_${suffix}`;
const workspace=path.join(process.cwd(),"workspaces",`.v10-p56-${suffix}`);
const time=new Date().toISOString();

function columns(table){
 return(db.prepare(`PRAGMA table_info(${table})`).all()).map(row=>String(row.name));
}

function insertAdaptive(table,values){
 const available=columns(table);
 const selected=Object.keys(values).filter(key=>available.includes(key));
 db.prepare(`
  INSERT INTO ${table}(${selected.join(",")})
  VALUES(${selected.map(()=>"?").join(",")})
 `).run(...selected.map(key=>values[key]));
}

insertAdaptive("projects",{
 id:projectId,
 name:projectId,
 slug:projectId,
 status:"active",
 progress:0,
 workspace,
 phase:"development",
 created_at:time,
 updated_at:time
});

insertAdaptive("tasks",{
 id:taskId,
 project_id:projectId,
 title:"Pass 5.6 lifecycle fixture",
 prompt:"Verify automatic repository learning.",
 status:"running",
 phase:"development",
 priority:0,
 attempts:1,
 max_attempts:3,
 repair_attempts:0,
 created_at:time,
 updated_at:time
});

fs.mkdirSync(path.join(workspace,"src"),{recursive:true});
fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({name:`p56-${suffix}`,version:"1.0.0"},null,2)
);
fs.writeFileSync(
 path.join(workspace,"src","user-service.ts"),
 [
  `export function userName() {`,
  `  return "Veylith";`,
  `}`,
  ""
 ].join("\n")
);

const baseline=captureRepositoryEvolution({
 projectId,
 taskId,
 workspace
});

await check("production executor imports evolution-aware agent context",async()=>{
 const source=fs.readFileSync(
  path.join(process.cwd(),"src","team","goal-role-executor.service.ts"),
  "utf8"
 );
 assert.match(source,/buildAgentProjectContext/);
});

await check("production executor uses autonomous project context",async()=>{
 const source=fs.readFileSync(
  path.join(process.cwd(),"src","team","goal-role-executor.service.ts"),
  "utf8"
 );
 assert.match(source,/VEYLITH AUTONOMOUS PROJECT CONTEXT/);
});

await check("production executor synchronizes repository learning",async()=>{
 const source=fs.readFileSync(
  path.join(process.cwd(),"src","team","goal-role-executor.service.ts"),
  "utf8"
 );
 assert.match(source,/synchronizeRepositoryLearning/);
});

await check("production recovery synchronizes repair evolution",async()=>{
 const source=fs.readFileSync(
  path.join(process.cwd(),"src","team","team-recovery.service.ts"),
  "utf8"
 );
 assert.match(source,/synchronizeRepairEvolution/);
});

await check("production recovery remembers verified repair outcome",async()=>{
 const source=fs.readFileSync(
  path.join(process.cwd(),"src","team","team-recovery.service.ts"),
  "utf8"
 );
 assert.match(source,/rememberRecoveryOutcome/);
 assert.match(source,/post-repair validation passed/);
});

await check("architect role does not create repository snapshot",async()=>{
 const before=repositoryEvolutionState(projectId).snapshots;
 const result=synchronizeRepositoryLearning({
  projectId,
  taskId,
  workspace,
  role:"architect",
  summary:"Architecture completed."
 });
 assert.equal(result.checked,false);
 assert.equal(repositoryEvolutionState(projectId).snapshots,before);
});

fs.writeFileSync(
 path.join(workspace,"src","account-service.ts"),
 [
  `export function accountName() {`,
  `  return "Veylith Account";`,
  `}`,
  ""
 ].join("\n")
);

let developerSync;

await check("developer success automatically captures repository evolution",async()=>{
 developerSync=synchronizeRepositoryLearning({
  projectId,
  taskId,
  workspace,
  role:"developer",
  summary:"Account service implemented.",
  files:["src/account-service.ts"],
  evidence:["developer role completed"]
 });
 assert.equal(developerSync.checked,true);
 assert.equal(developerSync.changed,true);
});

await check("developer lifecycle creates next repository snapshot",async()=>{
 const state=repositoryEvolutionState(projectId);
 assert.equal(state.snapshots,2);
 assert.equal(state.latestSnapshot.id,developerSync.snapshot.id);
 assert.equal(state.latestSnapshot.parentFingerprint,baseline.snapshot.fingerprint);
});

await check("developer lifecycle creates implementation evolution event",async()=>{
 assert.equal(developerSync.evolutionEvent.type,"implementation");
});

await check("developer lifecycle refreshes repository conventions",async()=>{
 const conventions=listRepositoryConventions(projectId,undefined,100);
 assert.ok(conventions.length>0);
});

await check("unchanged developer completion suppresses duplicate snapshot",async()=>{
 const result=synchronizeRepositoryLearning({
  projectId,
  taskId,
  workspace,
  role:"developer",
  summary:"No repository changes."
 });
 assert.equal(result.changed,false);
 assert.equal(repositoryEvolutionState(projectId).snapshots,2);
});

fs.writeFileSync(
 path.join(workspace,"src","account-service.ts"),
 [
  `export function accountName() {`,
  `  return "Recovered Account";`,
  `}`,
  ""
 ].join("\n")
);

let repairSync;

await check("repair lifecycle captures repaired repository state",async()=>{
 repairSync=synchronizeRepairEvolution({
  projectId,
  taskId,
  workspace,
  summary:"Corrected account service behavior.",
  files:["src/account-service.ts"],
  evidence:["repair attempt 1"]
 });
 assert.equal(repairSync.changed,true);
});

await check("repair evolution is typed as repair",async()=>{
 assert.equal(repairSync.evolutionEvent.type,"repair");
});

await check("repair evolution refreshes conventions",async()=>{
 assert.ok(
  listRepositoryConventions(projectId,undefined,100).length>0
 );
});

await check("verified recovery outcome becomes durable failure intelligence",async()=>{
 rememberRecoveryOutcome({
  projectId,
  taskId,
  fingerprint:"p56:test:account",
  failureKind:"test",
  summary:"Account test failed.",
  rootCause:"Account service returned stale value.",
  relevantFiles:["src/account-service.ts"],
  repairFiles:["src/account-service.ts"],
  strategy:["correct account service return value"],
  outcome:"resolved",
  evidence:["post-repair validation passed"]
 });
 const recalled=recallFailureHistory(
  projectId,
  "p56:test:account"
 );
 assert.ok(recalled);
 assert.equal(recalled.record.outcome,"resolved");
});

await check("historical recovery preserves root cause",async()=>{
 const recalled=recallFailureHistory(projectId,"p56:test:account");
 assert.equal(
  recalled.record.rootCause,
  "Account service returned stale value."
 );
});

await check("historical recovery preserves repair strategy",async()=>{
 const recalled=recallFailureHistory(projectId,"p56:test:account");
 assert.ok(
  recalled.record.strategy.includes("correct account service return value")
 );
});

await check("historical recovery links repaired files",async()=>{
 const recalled=recallFailureHistory(projectId,"p56:test:account");
 assert.ok(
  recalled.record.repairFiles.includes("src/account-service.ts")
 );
});

await check("repository evolution contains baseline implementation and repair states",async()=>{
 const state=repositoryEvolutionState(projectId);
 assert.equal(state.snapshots,3);
 assert.ok(state.events>=2);
});

await check("repository learning lifecycle writes durable project memory",async()=>{
 const row=db.prepare(`
  SELECT COUNT(*) AS count
  FROM project_memory
  WHERE project_id=? AND type='repository_learning_sync'
 `).get(projectId);
 assert.ok(Number(row.count)>=1);
});

await check("failure learning writes durable project memory",async()=>{
 const row=db.prepare(`
  SELECT COUNT(*) AS count
  FROM project_memory
  WHERE project_id=? AND type='failure_history'
 `).get(projectId);
 assert.ok(Number(row.count)>=1);
});

await check("lifecycle state survives service boundary through persistence",async()=>{
 const state=repositoryEvolutionState(projectId);
 const history=recallFailureHistory(projectId,"p56:test:account");
 assert.equal(state.latestSnapshot.id,repairSync.snapshot.id);
 assert.equal(history.record.outcome,"resolved");
});

deleteFailureHistoryByProject(projectId);
deleteRepositoryConventionsByProject(projectId);
deleteRepositoryEvolutionProject(projectId);

db.prepare("DELETE FROM project_memory WHERE project_id=?").run(projectId);
db.prepare("DELETE FROM tasks WHERE id=?").run(taskId);
db.prepare("DELETE FROM projects WHERE id=?").run(projectId);
fs.rmSync(workspace,{recursive:true,force:true});

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 5 PASS 5.6");
console.log(" AUTOMATIC REPOSITORY LEARNING LIFECYCLE");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("");
console.log(
 failed===0
  ?"VEYLITH v1.0 BATCH 5 PASS 5.6 PASSED"
  :"VEYLITH v1.0 BATCH 5 PASS 5.6 NOT YET CLOSED"
);
process.exitCode=failed===0?0:1;


