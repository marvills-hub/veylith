import assert from"node:assert/strict";
import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{db}from"../dist/database/database.js";
import{
 captureRepositoryEvolution
}from"../dist/evolution/repository-evolution.service.js";
import{
 deleteRepositoryEvolutionProject
}from"../dist/evolution/repository-evolution.repository.js";
import{
 analyzeRepositoryConventions,
 learnRepositoryConventions,
 repositoryConventionPrompt,
 repositoryConventionState
}from"../dist/conventions/repository-convention.service.js";
import{
 findRepositoryConvention,
 listRepositoryConventions,
 deleteRepositoryConventionsByProject
}from"../dist/conventions/repository-convention.repository.js";

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
const projectId=`p53_project_${suffix}`;
const noBaselineProject=`p53_nobase_${suffix}`;
const taskId=`p53_task_${suffix}`;
const workspace=path.join(
 process.cwd(),
 "workspaces",
 `.v10-p53-${suffix}`
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

for(const id of[projectId,noBaselineProject]){
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
 title:"Pass 5.3 convention fixture",
 prompt:"Learn repository conventions.",
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
fs.mkdirSync(
 path.join(workspace,"src","models"),
 {recursive:true}
);

fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({
  name:`p53-${suffix}`,
  version:"1.0.0"
 },null,2)
);

fs.writeFileSync(
 path.join(workspace,"tsconfig.json"),
 JSON.stringify({
  compilerOptions:{strict:true}
 },null,2)
);

const serviceFiles=[
 "user.service.ts",
 "task.service.ts",
 "project.service.ts",
 "memory.service.ts",
 "queue.service.ts"
];

for(const[fileIndex,file]of serviceFiles.entries()){
 fs.writeFileSync(
  path.join(workspace,"src","services",file),
  [
   `import { Item } from "../models/item.model";`,
   "",
   `export const service${fileIndex} = (item: Item) => {`,
   `  const value = item.name;`,
   `  return value;`,
   `};`,
   ""
  ].join("\n")
 );
}

fs.writeFileSync(
 path.join(workspace,"src","models","item.model.ts"),
 [
  `export interface Item {`,
  `  name: string;`,
  `}`,
  ""
 ].join("\n")
);

fs.writeFileSync(
 path.join(workspace,"src","services","user.service.spec.ts"),
 [
  `import { service0 } from "./user.service";`,
  "",
  `describe("user service", () => {`,
  `  it("works", () => {`,
  `    expect(service0({ name: "x" })).toBe("x");`,
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

let analysis;

await check("convention analysis requires evolution baseline",async()=>{
 assert.throws(
  ()=>analyzeRepositoryConventions({
   projectId:noBaselineProject,
   workspace
  }),
  /baseline required/
 );
});

await check("repository convention analysis succeeds",async()=>{
 analysis=analyzeRepositoryConventions({
  projectId,
  workspace
 });
 assert.ok(analysis.conventions.length>0);
});

await check("analysis binds source repository fingerprint",async()=>{
 assert.equal(
  analysis.sourceFingerprint,
  baseline.snapshot.fingerprint
 );
});

await check("source root is learned from repository evidence",async()=>{
 const item=analysis.conventions.find(
  value=>value.key==="structure.source-root"
 );
 assert.equal(item.value,"src");
});

await check("primary repository language is learned",async()=>{
 const item=analysis.conventions.find(
  value=>value.key==="language.primary"
 );
 assert.equal(item.value,"TypeScript");
});

await check("source filename convention is learned",async()=>{
 const item=analysis.conventions.find(
  value=>value.key==="naming.source-files"
 );
 assert.equal(item.value,"kebab-case");
});

await check("test placement convention is learned",async()=>{
 const item=analysis.conventions.find(
  value=>value.key==="testing.placement"
 );
 assert.equal(item.value,"colocated");
});

await check("test suffix convention is learned",async()=>{
 const item=analysis.conventions.find(
  value=>value.key==="testing.filename-suffix"
 );
 assert.equal(item.value,".spec");
});

await check("relative import convention is learned",async()=>{
 const item=analysis.conventions.find(
  value=>value.key==="imports.internal-style"
 );
 assert.equal(item.value,"relative");
});

await check("double quote convention is learned",async()=>{
 const item=analysis.conventions.find(
  value=>value.key==="formatting.quotes"
 );
 assert.equal(item.value,"double");
});

await check("semicolon convention is learned",async()=>{
 const item=analysis.conventions.find(
  value=>value.key==="formatting.semicolons"
 );
 assert.equal(item.value,"required");
});

await check("indentation convention is learned",async()=>{
 const item=analysis.conventions.find(
  value=>value.key==="formatting.indentation"
 );
 assert.equal(item.value,"2 spaces");
});

let learned;

await check("learned conventions persist",async()=>{
 learned=learnRepositoryConventions({
  projectId,
  workspace
 });
 assert.ok(learned.conventions.length>=8);
});

await check("persistent convention retains evidence count",async()=>{
 const item=findRepositoryConvention(
  projectId,
  "naming.source-files"
 );
 assert.ok(item.evidenceCount>=5);
});

await check("strong repeated repository evidence becomes high confidence",async()=>{
 const item=findRepositoryConvention(
  projectId,
  "naming.source-files"
 );
 assert.equal(item.confidence,"high");
});

await check("convention samples retain repository evidence",async()=>{
 const item=findRepositoryConvention(
  projectId,
  "naming.source-files"
 );
 assert.ok(
  item.samples.some(file=>
   file.endsWith("user.service.ts")
  )
 );
});

await check("learning same snapshot updates instead of duplicating",async()=>{
 const before=listRepositoryConventions(
  projectId
 ).length;

 learnRepositoryConventions({
  projectId,
  workspace
 });

 const after=listRepositoryConventions(
  projectId
 ).length;

 assert.equal(after,before);
});

await check("repository convention state summarizes learned rules",async()=>{
 const state=repositoryConventionState(
  projectId
 );
 assert.equal(
  state.total,
  listRepositoryConventions(projectId).length
 );
 assert.ok(state.total>=8);
});

await check("agent-ready convention prompt is generated",async()=>{
 const prompt=repositoryConventionPrompt(
  projectId
 );
 assert.match(prompt,/REPOSITORY CONVENTIONS/);
 assert.match(prompt,/naming\.source-files: kebab-case/);
 assert.match(prompt,/testing\.placement: colocated/);
});

await check("conventions write durable project memory",async()=>{
 const rows=db.prepare(`
  SELECT type
  FROM project_memory
  WHERE project_id=?
 `).all(projectId);

 assert.ok(
  rows.some(row=>
   String(row.type)==="repository_conventions"
  )
 );
});

await check("repository changes can refresh learned conventions",async()=>{
 fs.writeFileSync(
  path.join(workspace,"src","services","audit.service.ts"),
  [
   `import { Item } from "../models/item.model";`,
   "",
   `export const auditService = (item: Item) => {`,
   `  return item.name;`,
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
  summary:"Added another service following repository conventions."
 });

 assert.equal(evolved.changed,true);

 const refreshed=learnRepositoryConventions({
  projectId,
  workspace
 });

 assert.equal(
  refreshed.sourceFingerprint,
  evolved.snapshot.fingerprint
 );
});

await check("refreshed conventions point to latest repository state",async()=>{
 const item=findRepositoryConvention(
  projectId,
  "language.primary"
 );
 const state=repositoryConventionState(
  projectId
 );

 assert.equal(
  item.sourceFingerprint,
  state.conventions[0].sourceFingerprint
 );
});

await check("learned conventions survive repository reload boundary",async()=>{
 const item=findRepositoryConvention(
  projectId,
  "testing.filename-suffix"
 );
 assert.equal(item.value,".spec");
});

await check("convention cleanup removes project rules",async()=>{
 deleteRepositoryConventionsByProject(projectId);
 assert.equal(
  listRepositoryConventions(projectId).length,
  0
 );
});

deleteRepositoryConventionsByProject(
 noBaselineProject
);
deleteRepositoryEvolutionProject(projectId);

db.prepare(`
 DELETE FROM project_memory
 WHERE project_id IN(?,?)
`).run(projectId,noBaselineProject);

db.prepare(`
 DELETE FROM tasks
 WHERE id=?
`).run(taskId);

db.prepare(`
 DELETE FROM projects
 WHERE id IN(?,?)
`).run(projectId,noBaselineProject);

fs.rmSync(
 workspace,
 {recursive:true,force:true}
);

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 5 PASS 5.3");
console.log(" REPOSITORY CONVENTION LEARNING");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("");
console.log(
 failed===0
 ?"VEYLITH v1.0 BATCH 5 PASS 5.3 PASSED"
 :"VEYLITH v1.0 BATCH 5 PASS 5.3 NOT YET CLOSED"
);

process.exitCode=failed===0?0:1;
