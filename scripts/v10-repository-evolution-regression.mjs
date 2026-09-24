import assert from"node:assert/strict";
import crypto from"node:crypto";
import fs from"node:fs";
import path from"node:path";
import{db}from"../dist/database/database.js";
import{
 captureRepositoryEvolution,
 repositoryEvolutionState
}from"../dist/evolution/repository-evolution.service.js";
import{
 createRepositoryEvolutionEvent,
 findRepositoryEvolutionSnapshot,
 getRepositoryEvolutionSnapshot,
 latestRepositoryEvolutionSnapshot,
 listRepositoryEvolutionEvents,
 listRepositoryEvolutionSnapshots,
 deleteRepositoryEvolutionProject
}from"../dist/evolution/repository-evolution.repository.js";

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
const projectId=`p51_project_${suffix}`;
const taskId=`p51_task_${suffix}`;
const workspace=path.join(
 process.cwd(),
 "workspaces",
 `.v10-p51-${suffix}`
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

fs.mkdirSync(
 path.join(workspace,"src"),
 {recursive:true}
);

fs.writeFileSync(
 path.join(workspace,"package.json"),
 JSON.stringify({
  name:`p51-${suffix}`,
  version:"1.0.0",
  scripts:{test:"node test.js"}
 },null,2)
);

fs.writeFileSync(
 path.join(workspace,"src","index.ts"),
 'export const version="one";\n'
);

fs.mkdirSync(
 path.join(workspace,"node_modules","ignored"),
 {recursive:true}
);

fs.writeFileSync(
 path.join(workspace,"node_modules","ignored","x.js"),
 "ignored\n"
);

insertAdaptive("projects",{
 id:projectId,
 name:"Pass 5.1 Evolution Fixture",
 slug:`p51-${suffix}`,
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
 title:"Repository evolution fixture",
 prompt:"Track repository evolution.",
 status:"running",
 phase:"development",
 priority:0,
 attempts:1,
 max_attempts:3,
 repair_attempts:0,
 created_at:time,
 updated_at:time
});

let baseline;

await check("initial repository state creates baseline snapshot",async()=>{
 baseline=captureRepositoryEvolution({
  projectId,
  taskId,
  workspace
 });

 assert.equal(baseline.changed,true);
 assert.equal(baseline.snapshot.sequence,1);
 assert.equal(baseline.snapshot.parentFingerprint,null);
 assert.equal(baseline.event.type,"baseline");
});

await check("ignored dependency directory excluded from snapshot",async()=>{
 assert.equal(
  baseline.snapshot.files.some(
   file=>file.startsWith("node_modules/")
  ),
  false
 );
});

await check("baseline file list is deterministic",async()=>{
 assert.deepEqual(
  baseline.snapshot.files,
  ["package.json","src/index.ts"]
 );
});

await check("baseline fingerprint persists",async()=>{
 const saved=getRepositoryEvolutionSnapshot(
  baseline.snapshot.id
 );
 assert.equal(
  saved.fingerprint,
  baseline.snapshot.fingerprint
 );
});

await check("unchanged repository does not create duplicate snapshot",async()=>{
 const result=captureRepositoryEvolution({
  projectId,
  taskId,
  workspace
 });

 assert.equal(result.changed,false);
 assert.equal(result.snapshot.id,baseline.snapshot.id);
 assert.equal(result.event,null);
});

await check("unchanged repository keeps one snapshot",async()=>{
 assert.equal(
  listRepositoryEvolutionSnapshots(projectId).length,
  1
 );
});

fs.writeFileSync(
 path.join(workspace,"src","index.ts"),
 'export const version="two";\n'
);

fs.writeFileSync(
 path.join(workspace,"src","feature.ts"),
 "export const feature=true;\n"
);

let second;

await check("repository modification creates next evolution snapshot",async()=>{
 second=captureRepositoryEvolution({
  projectId,
  taskId,
  workspace,
  type:"implementation",
  title:"Feature implemented",
  summary:"Updated index and introduced feature module.",
  evidence:["development-result"]
 });

 assert.equal(second.changed,true);
 assert.equal(second.snapshot.sequence,2);
});

await check("new snapshot links parent fingerprint",async()=>{
 assert.equal(
  second.snapshot.parentFingerprint,
  baseline.snapshot.fingerprint
 );
});

await check("repository fingerprint changes with content",async()=>{
 assert.notEqual(
  second.snapshot.fingerprint,
  baseline.snapshot.fingerprint
 );
});

await check("second snapshot contains new repository file",async()=>{
 assert.ok(
  second.snapshot.files.includes("src/feature.ts")
 );
});

await check("evolution event binds to created snapshot",async()=>{
 assert.equal(
  second.event.snapshotId,
  second.snapshot.id
 );
 assert.equal(
  second.event.type,
  "implementation"
 );
});

await check("evolution event preserves evidence",async()=>{
 assert.deepEqual(
  second.event.evidence,
  ["development-result"]
 );
});

await check("snapshot lookup by fingerprint works",async()=>{
 const found=findRepositoryEvolutionSnapshot(
  projectId,
  second.snapshot.fingerprint
 );
 assert.equal(found.id,second.snapshot.id);
});

await check("latest snapshot resolves highest sequence",async()=>{
 const latest=latestRepositoryEvolutionSnapshot(
  projectId
 );
 assert.equal(latest.id,second.snapshot.id);
 assert.equal(latest.sequence,2);
});

await check("snapshot history remains ordered",async()=>{
 const rows=listRepositoryEvolutionSnapshots(
  projectId
 );
 assert.deepEqual(
  rows.map(row=>row.sequence),
  [1,2]
 );
});

await check("event history remains persistent",async()=>{
 const rows=listRepositoryEvolutionEvents(
  projectId
 );
 assert.equal(rows.length,2);
 assert.equal(rows[0].type,"baseline");
 assert.equal(rows[1].type,"implementation");
});

await check("manual decision event can be recorded",async()=>{
 const event=createRepositoryEvolutionEvent({
  projectId,
  taskId,
  snapshotId:second.snapshot.id,
  type:"decision",
  title:"Preserve module boundary",
  summary:"Feature remains isolated from repository entry point.",
  files:["src/feature.ts"],
  evidence:["architectural-decision"],
  metadata:{source:"regression"}
 });

 assert.equal(event.type,"decision");
 assert.equal(
  event.metadata.source,
  "regression"
 );
});

await check("cross-project snapshot binding is rejected",async()=>{
 assert.throws(
  ()=>createRepositoryEvolutionEvent({
   projectId:`other_${suffix}`,
   snapshotId:second.snapshot.id,
   type:"decision",
   title:"Invalid",
   summary:"Invalid cross-project event."
  }),
  /another project/
 );
});

await check("repository evolution state summarizes project history",async()=>{
 const state=repositoryEvolutionState(
  projectId
 );

 assert.equal(state.snapshots,2);
 assert.equal(state.events,3);
 assert.equal(
  state.latestSnapshot.id,
  second.snapshot.id
 );
});

await check("repository evolution writes project memory",async()=>{
 const rows=db.prepare(`
  SELECT type
  FROM project_memory
  WHERE project_id=?
 `).all(projectId);

 assert.ok(
  rows.some(row=>
   String(row.type)==="repository_evolution"
  )
 );
});

await check("snapshot survives service reload boundary",async()=>{
 const saved=latestRepositoryEvolutionSnapshot(
  projectId
 );

 assert.equal(saved.sequence,2);
 assert.equal(
  saved.fingerprint,
  second.snapshot.fingerprint
 );
});

await check("project evolution cleanup removes snapshots and events",async()=>{
 deleteRepositoryEvolutionProject(projectId);

 assert.equal(
  listRepositoryEvolutionSnapshots(projectId).length,
  0
 );

 assert.equal(
  listRepositoryEvolutionEvents(projectId).length,
  0
 );
});

db.prepare(`
 DELETE FROM project_memory
 WHERE project_id=?
`).run(projectId);

db.prepare(`
 DELETE FROM tasks
 WHERE id=?
`).run(taskId);

db.prepare(`
 DELETE FROM projects
 WHERE id=?
`).run(projectId);

fs.rmSync(
 workspace,
 {recursive:true,force:true}
);

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 5 PASS 5.1");
console.log(" PERSISTENT REPOSITORY EVOLUTION MODEL");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);
console.log("");
console.log(
 failed===0
 ?"VEYLITH v1.0 BATCH 5 PASS 5.1 PASSED"
 :"VEYLITH v1.0 BATCH 5 PASS 5.1 NOT YET CLOSED"
);

process.exitCode=failed===0?0:1;
