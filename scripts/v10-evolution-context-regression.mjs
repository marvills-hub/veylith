import assert from"node:assert/strict";
import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{db}from"../dist/database/database.js";
import{
 captureRepositoryEvolution
}from"../dist/evolution/repository-evolution.service.js";
import{
 createRepositoryEvolutionEvent,
 deleteRepositoryEvolutionProject
}from"../dist/evolution/repository-evolution.repository.js";
import{
 rememberProjectKnowledge
}from"../dist/knowledge/project-knowledge.service.js";
import{
 deleteProjectKnowledgeByProject
}from"../dist/knowledge/project-knowledge.repository.js";
import{
 learnRepositoryConventions
}from"../dist/conventions/repository-convention.service.js";
import{
 deleteRepositoryConventionsByProject
}from"../dist/conventions/repository-convention.repository.js";
import{
 rememberFailureResolution
}from"../dist/intelligence/history/failure-history.service.js";
import{
 deleteFailureHistoryByProject
}from"../dist/intelligence/history/failure-history.repository.js";
import{
 buildEvolutionAwareContext,
 evolutionAwareContextPrompt
}from"../dist/context/evolution-aware-context.service.js";

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
const projectId=`p55_project_${suffix}`;
const otherProjectId=`p55_other_${suffix}`;
const taskId=`p55_task_${suffix}`;
const workspace=path.join(
 process.cwd(),
 "workspaces",
 `.v10-p55-${suffix}`
);
const time=new Date().toISOString();

function columns(table){
 return(db.prepare(`PRAGMA table_info(${table})`).all())
  .map(row=>String(row.name));
}

function insertAdaptive(table,values){
 const available=columns(table);
 const selected=Object.keys(values)
  .filter(key=>available.includes(key));

 db.prepare(`
  INSERT INTO ${table}(${selected.join(",")})
  VALUES(${selected.map(()=>"?").join(",")})
 `).run(...selected.map(key=>values[key]));
}

for(const id of[projectId,otherProjectId]){
 insertAdaptive("projects",{
  id,
  name:id,
  slug:id,
  status:"active",
  progress:0,
  workspace,
  phase:"development",
  created_at:time,
  updated_at:time
 });
}

insertAdaptive("tasks",{
 id:taskId,
 project_id:projectId,
 title:"Pass 5.5 context fixture",
 prompt:"Build evolution-aware agent context.",
 status:"running",
 phase:"development",
 priority:0,
 attempts:1,
 max_attempts:3,
 repair_attempts:0,
 created_at:time,
 updated_at:time
});

fs.mkdirSync(
 path.join(workspace,"src","services"),
 {recursive:true}
);

fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({
  name:`p55-${suffix}`,
  version:"1.0.0"
 },null,2)
);

fs.writeFileSync(
 path.join(workspace,"src","services","user.service.ts"),
 [
  `export const getUser = () => {`,
  `  return "user";`,
  `};`,
  ""
 ].join("\n")
);

fs.writeFileSync(
 path.join(workspace,"src","services","user.service.spec.ts"),
 [
  `import { getUser } from "./user.service";`,
  "",
  `describe("getUser", () => {`,
  `  it("returns user", () => {`,
  `    expect(getUser()).toBe("user");`,
  `  });`,
  `});`,
  ""
 ].join("\n")
);

const baseline=captureRepositoryEvolution({
 projectId,
 taskId,
 workspace
});

const architectureEvent=createRepositoryEvolutionEvent({
 projectId,
 taskId,
 snapshotId:baseline.snapshot.id,
 type:"architecture",
 title:"Service boundary established",
 summary:"Business behavior remains behind service modules.",
 files:["src/services/user.service.ts"],
 evidence:["architecture-review"]
});

rememberProjectKnowledge({
 projectId,
 taskId,
 snapshotId:baseline.snapshot.id,
 evolutionEventId:architectureEvent.id,
 type:"architecture",
 key:"architecture.service-boundary",
 title:"Preserve service boundary",
 summary:"Business behavior remains behind service modules.",
 rationale:"Keeps transport concerns separate from domain behavior.",
 affectedFiles:["src/services/user.service.ts"],
 constraints:["Do not move domain rules into transport handlers"]
});

rememberProjectKnowledge({
 projectId,
 taskId,
 type:"testing",
 key:"testing.verify-before-delivery",
 title:"Verify before delivery",
 summary:"Validation evidence must be green before delivery.",
 rationale:"Prevents known failing states from being published."
});

rememberProjectKnowledge({
 projectId,
 taskId,
 type:"delivery",
 key:"delivery.main-branch",
 title:"Deliver through main",
 summary:"Approved autonomous delivery targets the main branch."
});

learnRepositoryConventions({
 projectId,
 workspace
});

rememberFailureResolution({
 projectId,
 taskId,
 fingerprint:"test:user-service:fixture",
 failureKind:"test",
 summary:"User service test failed from stale fixture state.",
 rootCause:"Test fixture was not reset.",
 relevantFiles:["src/services/user.service.spec.ts"],
 repairFiles:["src/services/user.service.spec.ts"],
 strategy:["reset fixture before each test"],
 outcome:"resolved",
 evidence:["focused test passed after repair"]
});

let developerContext;

await check("developer evolution-aware context builds",async()=>{
 developerContext=buildEvolutionAwareContext({
  projectId,
  role:"developer"
 });
 assert.equal(developerContext.projectId,projectId);
 assert.equal(developerContext.role,"developer");
});

await check("context includes current repository evolution",async()=>{
 assert.equal(
  developerContext.repositoryEvolution.latestSnapshot.id,
  baseline.snapshot.id
 );
});

await check("context exposes repository fingerprint",async()=>{
 assert.match(
  developerContext.prompt,
  new RegExp(baseline.snapshot.fingerprint)
 );
});

await check("developer receives active architecture knowledge",async()=>{
 assert.ok(
  developerContext.activeKnowledge.some(item=>
   item.key==="architecture.service-boundary"
  )
 );
});

await check("developer does not receive unrelated delivery-only knowledge",async()=>{
 assert.equal(
  developerContext.activeKnowledge.some(item=>
   item.key==="delivery.main-branch"
  ),
  false
 );
});

await check("developer receives learned repository conventions",async()=>{
 assert.ok(
  developerContext.conventions.length>0
 );
});

await check("developer receives historical failure intelligence",async()=>{
 assert.ok(
  developerContext.failureHistory.some(item=>
   item.fingerprint==="test:user-service:fixture"
  )
 );
});

await check("developer prompt contains repository evolution section",async()=>{
 assert.match(
  developerContext.prompt,
  /REPOSITORY EVOLUTION/
 );
});

await check("developer prompt contains active project knowledge",async()=>{
 assert.match(
  developerContext.prompt,
  /ACTIVE PROJECT KNOWLEDGE/
 );
 assert.match(
  developerContext.prompt,
  /Preserve service boundary/
 );
});

await check("developer prompt contains learned conventions",async()=>{
 assert.match(
  developerContext.prompt,
  /LEARNED REPOSITORY CONVENTIONS/
 );
});

await check("developer prompt contains historical failure intelligence",async()=>{
 assert.match(
  developerContext.prompt,
  /HISTORICAL FAILURE INTELLIGENCE/
 );
 assert.match(
  developerContext.prompt,
  /Test fixture was not reset/
 );
});

await check("tester receives testing knowledge",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"tester"
 });

 assert.ok(
  context.activeKnowledge.some(item=>
   item.key==="testing.verify-before-delivery"
  )
 );
});

await check("tester receives historical failures",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"tester"
 });

 assert.ok(context.failureHistory.length>0);
});

await check("reviewer receives historical failures",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"reviewer"
 });

 assert.ok(context.failureHistory.length>0);
});

await check("diagnostic receives historical failures",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"diagnostic"
 });

 assert.ok(context.failureHistory.length>0);
});

await check("repair receives historical failures",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"repair"
 });

 assert.ok(context.failureHistory.length>0);
});

await check("architect receives architecture knowledge",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"architect"
 });

 assert.ok(
  context.activeKnowledge.some(item=>
   item.key==="architecture.service-boundary"
  )
 );
});

await check("architect context scopes conventions",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"architect"
 });

 assert.ok(
  context.conventions.every(item=>
   ["structure","language","testing"].includes(item.category)
  )
 );
});

await check("architect does not receive repair history by default",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"architect"
 });

 assert.equal(context.failureHistory.length,0);
});

await check("planner does not receive repair history by default",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"planner"
 });

 assert.equal(context.failureHistory.length,0);
});

await check("documentation does not receive repair history by default",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"documentation"
 });

 assert.equal(context.failureHistory.length,0);
});

await check("delivery receives delivery knowledge",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"delivery"
 });

 assert.ok(
  context.activeKnowledge.some(item=>
   item.key==="delivery.main-branch"
  )
 );
});

await check("delivery does not receive repair history by default",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"delivery"
 });

 assert.equal(context.failureHistory.length,0);
});

await check("role-scoped context remains project isolated",async()=>{
 const context=buildEvolutionAwareContext({
  projectId:otherProjectId,
  role:"developer"
 });

 assert.equal(context.activeKnowledge.length,0);
 assert.equal(context.conventions.length,0);
 assert.equal(context.failureHistory.length,0);
});

await check("evolution-aware prompt helper returns composed prompt",async()=>{
 assert.equal(
  evolutionAwareContextPrompt(developerContext),
  developerContext.prompt
 );
});

await check("context generation does not mutate historical records",async()=>{
 const before=developerContext.failureHistory[0].occurrences;

 const again=buildEvolutionAwareContext({
  projectId,
  role:"developer"
 });

 const record=again.failureHistory.find(item=>
  item.fingerprint==="test:user-service:fixture"
 );

 assert.equal(record.occurrences,before);
});

await check("context generation does not create evolution snapshots",async()=>{
 const before=developerContext.repositoryEvolution.snapshots;

 const again=buildEvolutionAwareContext({
  projectId,
  role:"developer"
 });

 assert.equal(
  again.repositoryEvolution.snapshots,
  before
 );
});

await check("context reflects newly evolved repository state",async()=>{
 fs.writeFileSync(
  path.join(workspace,"src","services","audit.service.ts"),
  [
   `export const audit = () => {`,
   `  return true;`,
   `};`,
   ""
  ].join("\n")
 );

 const evolved=captureRepositoryEvolution({
  projectId,
  taskId,
  workspace,
  type:"implementation",
  title:"Audit service added",
  summary:"Added audit behavior."
 });

 const refreshed=buildEvolutionAwareContext({
  projectId,
  role:"developer"
 });

 assert.equal(
  refreshed.repositoryEvolution.latestSnapshot.id,
  evolved.snapshot.id
 );
});

await check("context survives service reload boundary through persistence",async()=>{
 const context=buildEvolutionAwareContext({
  projectId,
  role:"developer"
 });

 assert.ok(
  context.activeKnowledge.some(item=>
   item.key==="architecture.service-boundary"
  )
 );

 assert.ok(
  context.failureHistory.some(item=>
   item.fingerprint==="test:user-service:fixture"
  )
 );
});

deleteFailureHistoryByProject(projectId);
deleteFailureHistoryByProject(otherProjectId);
deleteRepositoryConventionsByProject(projectId);
deleteRepositoryConventionsByProject(otherProjectId);
deleteProjectKnowledgeByProject(projectId);
deleteProjectKnowledgeByProject(otherProjectId);
deleteRepositoryEvolutionProject(projectId);
deleteRepositoryEvolutionProject(otherProjectId);

db.prepare(`
 DELETE FROM project_memory
 WHERE project_id IN(?,?)
`).run(projectId,otherProjectId);

db.prepare(`
 DELETE FROM tasks
 WHERE id=?
`).run(taskId);

db.prepare(`
 DELETE FROM projects
 WHERE id IN(?,?)
`).run(projectId,otherProjectId);

fs.rmSync(
 workspace,
 {recursive:true,force:true}
);

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 5 PASS 5.5");
console.log(" EVOLUTION-AWARE AGENT CONTEXT");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("");
console.log(
 failed===0
 ?"VEYLITH v1.0 BATCH 5 PASS 5.5 PASSED"
 :"VEYLITH v1.0 BATCH 5 PASS 5.5 NOT YET CLOSED"
);

process.exitCode=failed===0?0:1;
