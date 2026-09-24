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
 rememberProjectKnowledge,
 retireRememberedProjectKnowledge,
 projectKnowledgeState,
 projectKnowledgePrompt,
 getRememberedProjectKnowledge
}from"../dist/knowledge/project-knowledge.service.js";
import{
 findActiveProjectKnowledge,
 listProjectKnowledge,
 deleteProjectKnowledgeByProject
}from"../dist/knowledge/project-knowledge.repository.js";

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
const projectId=`p52_project_${suffix}`;
const otherProjectId=`p52_other_${suffix}`;
const taskId=`p52_task_${suffix}`;
const workspace=path.join(
 process.cwd(),
 "workspaces",
 `.v10-p52-${suffix}`
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

fs.mkdirSync(path.join(workspace,"src"),{recursive:true});
fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({
  name:`p52-${suffix}`,
  version:"1.0.0"
 },null,2)
);
fs.writeFileSync(
 path.join(workspace,"src","app.ts"),
 "export const app=true;\n"
);

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
 title:"Pass 5.2 knowledge fixture",
 prompt:"Persist architectural knowledge.",
 status:"running",
 phase:"development",
 priority:0,
 attempts:1,
 max_attempts:3,
 repair_attempts:0,
 created_at:time,
 updated_at:time
});

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
 title:"Service boundary selected",
 summary:"Domain behavior remains behind service modules.",
 files:["src/app.ts"],
 evidence:["architecture-plan"]
});

let first;

await check("architectural decision can be remembered",async()=>{
 first=rememberProjectKnowledge({
  projectId,
  taskId,
  snapshotId:baseline.snapshot.id,
  evolutionEventId:architectureEvent.id,
  type:"architecture",
  key:"architecture.service-boundary",
  title:"Preserve service boundary",
  summary:"Domain behavior must remain behind service modules.",
  rationale:"Prevents transport and persistence concerns from owning domain behavior.",
  affectedFiles:["src/app.ts"],
  constraints:[
   "HTTP handlers must not own domain rules",
   "Persistence details remain outside domain behavior"
  ],
  consequences:[
   "New features extend service modules first"
  ],
  evidence:[
   "architecture-plan",
   "repository-baseline"
  ],
  metadata:{source:"pass-5.2"}
 });

 assert.equal(first.status,"active");
 assert.equal(first.type,"architecture");
});

await check("knowledge links repository snapshot",async()=>{
 assert.equal(
  first.snapshotId,
  baseline.snapshot.id
 );
});

await check("knowledge links evolution event",async()=>{
 assert.equal(
  first.evolutionEventId,
  architectureEvent.id
 );
});

await check("knowledge rationale persists",async()=>{
 const saved=getRememberedProjectKnowledge(first.id);
 assert.equal(
  saved.rationale,
  "Prevents transport and persistence concerns from owning domain behavior."
 );
});

await check("knowledge constraints persist",async()=>{
 const saved=getRememberedProjectKnowledge(first.id);
 assert.equal(saved.constraints.length,2);
});

await check("knowledge consequences persist",async()=>{
 const saved=getRememberedProjectKnowledge(first.id);
 assert.equal(saved.consequences.length,1);
});

await check("affected files persist deterministically",async()=>{
 const saved=getRememberedProjectKnowledge(first.id);
 assert.deepEqual(saved.affectedFiles,["src/app.ts"]);
});

await check("identical memory is idempotent",async()=>{
 const again=rememberProjectKnowledge({
  projectId,
  taskId,
  snapshotId:baseline.snapshot.id,
  evolutionEventId:architectureEvent.id,
  type:"architecture",
  key:"architecture.service-boundary",
  title:"Preserve service boundary",
  summary:"Domain behavior must remain behind service modules.",
  rationale:"Prevents transport and persistence concerns from owning domain behavior.",
  affectedFiles:["src/app.ts"]
 });

 assert.equal(again.id,first.id);
});

await check("conflicting active knowledge requires explicit replacement",async()=>{
 assert.throws(
  ()=>rememberProjectKnowledge({
   projectId,
   type:"architecture",
   key:"architecture.service-boundary",
   title:"Different architecture",
   summary:"Replace service modules with direct handlers."
  }),
  /already exists/
 );
});

let replacement;

await check("architectural knowledge can be superseded",async()=>{
 replacement=rememberProjectKnowledge({
  projectId,
  taskId,
  snapshotId:baseline.snapshot.id,
  type:"architecture",
  key:"architecture.service-boundary",
  title:"Preserve explicit application service boundary",
  summary:"Transport delegates to application services which own orchestration.",
  rationale:"The project needs a stable application boundary as features grow.",
  affectedFiles:["src/app.ts"],
  constraints:[
   "Transport remains thin"
  ],
  consequences:[
   "Application services become the integration boundary"
  ],
  evidence:["architecture-refinement"],
  replace:true
 });

 assert.notEqual(replacement.id,first.id);
 assert.equal(replacement.supersedesId,first.id);
});

await check("superseded decision retains historical record",async()=>{
 const previous=getRememberedProjectKnowledge(first.id);
 assert.equal(previous.status,"superseded");
 assert.equal(previous.supersededById,replacement.id);
});

await check("replacement becomes active decision for key",async()=>{
 const active=findActiveProjectKnowledge(
  projectId,
  "architecture.service-boundary"
 );
 assert.equal(active.id,replacement.id);
});

await check("knowledge history contains both decision versions",async()=>{
 const rows=listProjectKnowledge(projectId);
 assert.equal(rows.length,2);
});

let lesson;

await check("non-architectural durable lesson can be remembered",async()=>{
 lesson=rememberProjectKnowledge({
  projectId,
  taskId,
  type:"lesson",
  key:"lesson.validation-before-delivery",
  title:"Validate before delivery",
  summary:"Delivery must use verified validation evidence.",
  rationale:"Prevents publication of known failing repository states.",
  constraints:["Validation evidence must be current"],
  evidence:["batch-4-validation"]
 });

 assert.equal(lesson.type,"lesson");
 assert.equal(lesson.status,"active");
});

await check("knowledge state summarizes lifecycle",async()=>{
 const state=projectKnowledgeState(projectId);
 assert.equal(state.total,3);
 assert.equal(state.active,2);
 assert.equal(state.superseded,1);
 assert.equal(state.retired,0);
});

await check("active knowledge prompt excludes superseded decision",async()=>{
 const prompt=projectKnowledgePrompt(projectId);
 assert.match(
  prompt,
  /Preserve explicit application service boundary/
 );
 assert.match(
  prompt,
  /Validate before delivery/
 );
 assert.doesNotMatch(
  prompt,
  /Preserve service boundary\nKey/
 );
});

await check("knowledge prompt includes rationale and constraints",async()=>{
 const prompt=projectKnowledgePrompt(projectId);
 assert.match(prompt,/Rationale:/);
 assert.match(prompt,/Constraints:/);
});

await check("active knowledge can be retired",async()=>{
 const retired=retireRememberedProjectKnowledge(
  lesson.id
 );
 assert.equal(retired.status,"retired");
});

await check("retired knowledge disappears from active prompt",async()=>{
 const prompt=projectKnowledgePrompt(projectId);
 assert.doesNotMatch(
  prompt,
  /Validate before delivery/
 );
});

await check("retirement remains in historical knowledge",async()=>{
 const state=projectKnowledgeState(projectId);
 assert.equal(state.retired,1);
 assert.equal(state.total,3);
});

await check("superseded knowledge cannot be retired",async()=>{
 assert.throws(
  ()=>retireRememberedProjectKnowledge(first.id),
  /Superseded/
 );
});

await check("cross-project snapshot knowledge is rejected",async()=>{
 assert.throws(
  ()=>rememberProjectKnowledge({
   projectId:otherProjectId,
   snapshotId:baseline.snapshot.id,
   type:"architecture",
   key:"invalid.snapshot",
   title:"Invalid snapshot",
   summary:"Must fail ownership guard."
  }),
  /another project/
 );
});

await check("cross-project evolution event knowledge is rejected",async()=>{
 assert.throws(
  ()=>rememberProjectKnowledge({
   projectId:otherProjectId,
   evolutionEventId:architectureEvent.id,
   type:"architecture",
   key:"invalid.event",
   title:"Invalid event",
   summary:"Must fail ownership guard."
  }),
  /another project/
 );
});

await check("knowledge survives repository reload boundary",async()=>{
 const saved=getRememberedProjectKnowledge(
  replacement.id
 );
 assert.equal(saved.status,"active");
 assert.equal(
  saved.key,
  "architecture.service-boundary"
 );
});

await check("project knowledge writes durable project memory",async()=>{
 const rows=db.prepare(`
  SELECT type
  FROM project_memory
  WHERE project_id=?
 `).all(projectId);

 assert.ok(
  rows.some(row=>
   String(row.type)==="project_knowledge"
  )
 );
});

await check("knowledge retirement writes project memory",async()=>{
 const rows=db.prepare(`
  SELECT type
  FROM project_memory
  WHERE project_id=?
 `).all(projectId);

 assert.ok(
  rows.some(row=>
   String(row.type)==="project_knowledge_retired"
  )
 );
});

await check("knowledge cleanup removes complete project history",async()=>{
 deleteProjectKnowledgeByProject(projectId);
 assert.equal(
  listProjectKnowledge(projectId).length,
  0
 );
});

deleteProjectKnowledgeByProject(otherProjectId);
deleteRepositoryEvolutionProject(projectId);

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
console.log(" VEYLITH v1.0 BATCH 5 PASS 5.2");
console.log(" ARCHITECTURAL DECISION + KNOWLEDGE MEMORY");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("");
console.log(
 failed===0
 ?"VEYLITH v1.0 BATCH 5 PASS 5.2 PASSED"
 :"VEYLITH v1.0 BATCH 5 PASS 5.2 NOT YET CLOSED"
);

process.exitCode=failed===0?0:1;
