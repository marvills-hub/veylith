import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{
 RepositoryEvolutionEvent,
 RepositoryEvolutionEventType,
 RepositoryEvolutionSnapshot
}from"./repository-evolution.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS repository_evolution_snapshots(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 cycle_id TEXT,
 workspace TEXT NOT NULL,
 sequence INTEGER NOT NULL,
 fingerprint TEXT NOT NULL,
 parent_fingerprint TEXT,
 file_count INTEGER NOT NULL DEFAULT 0,
 files_json TEXT NOT NULL DEFAULT '[]',
 metadata_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL,
 UNIQUE(project_id,sequence)
);
CREATE INDEX IF NOT EXISTS idx_repository_evolution_snapshots_project
ON repository_evolution_snapshots(project_id,sequence DESC);
CREATE INDEX IF NOT EXISTS idx_repository_evolution_snapshots_fingerprint
ON repository_evolution_snapshots(project_id,fingerprint);

CREATE TABLE IF NOT EXISTS repository_evolution_events(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 cycle_id TEXT,
 snapshot_id TEXT,
 type TEXT NOT NULL,
 title TEXT NOT NULL,
 summary TEXT NOT NULL,
 files_json TEXT NOT NULL DEFAULT '[]',
 evidence_json TEXT NOT NULL DEFAULT '[]',
 metadata_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_repository_evolution_events_project
ON repository_evolution_events(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repository_evolution_events_snapshot
ON repository_evolution_events(snapshot_id);
`);

function array(value:any):string[]{
 if(!value)return[];
 try{
  const parsed=JSON.parse(String(value));
  return Array.isArray(parsed)?parsed.map(String):[];
 }catch{
  return[];
 }
}

function object(value:any):Record<string,unknown>{
 if(!value)return{};
 try{
  const parsed=JSON.parse(String(value));
  return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)
   ?parsed
   :{};
 }catch{
  return{};
 }
}

function snapshot(row:any):RepositoryEvolutionSnapshot{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  cycleId:row.cycle_id?String(row.cycle_id):null,
  workspace:String(row.workspace),
  sequence:Number(row.sequence),
  fingerprint:String(row.fingerprint),
  parentFingerprint:row.parent_fingerprint
   ?String(row.parent_fingerprint)
   :null,
  fileCount:Number(row.file_count||0),
  files:array(row.files_json),
  metadata:object(row.metadata_json),
  createdAt:String(row.created_at)
 };
}

function event(row:any):RepositoryEvolutionEvent{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  cycleId:row.cycle_id?String(row.cycle_id):null,
  snapshotId:row.snapshot_id?String(row.snapshot_id):null,
  type:String(row.type) as RepositoryEvolutionEventType,
  title:String(row.title),
  summary:String(row.summary),
  files:array(row.files_json),
  evidence:array(row.evidence_json),
  metadata:object(row.metadata_json),
  createdAt:String(row.created_at)
 };
}

export function getRepositoryEvolutionSnapshot(id:string){
 const row=db.prepare(`
  SELECT * FROM repository_evolution_snapshots WHERE id=?
 `).get(id) as any;
 return row?snapshot(row):null;
}

export function latestRepositoryEvolutionSnapshot(projectId:string){
 const row=db.prepare(`
  SELECT *
  FROM repository_evolution_snapshots
  WHERE project_id=?
  ORDER BY sequence DESC
  LIMIT 1
 `).get(projectId) as any;
 return row?snapshot(row):null;
}

export function listRepositoryEvolutionSnapshots(
 projectId:string,
 limit=100
){
 return(db.prepare(`
  SELECT *
  FROM repository_evolution_snapshots
  WHERE project_id=?
  ORDER BY sequence ASC
  LIMIT ?
 `).all(projectId,limit) as any[]).map(snapshot);
}

export function findRepositoryEvolutionSnapshot(
 projectId:string,
 fingerprint:string
){
 const row=db.prepare(`
  SELECT *
  FROM repository_evolution_snapshots
  WHERE project_id=? AND fingerprint=?
  ORDER BY sequence DESC
  LIMIT 1
 `).get(projectId,fingerprint) as any;
 return row?snapshot(row):null;
}

export function createRepositoryEvolutionSnapshot(input:{
 projectId:string;
 taskId?:string|null;
 cycleId?:string|null;
 workspace:string;
 fingerprint:string;
 files:string[];
 metadata?:Record<string,unknown>;
}){
 const duplicate=findRepositoryEvolutionSnapshot(
  input.projectId,
  input.fingerprint
 );
 if(duplicate)return duplicate;

 db.exec("BEGIN IMMEDIATE");
 try{
  const previous=latestRepositoryEvolutionSnapshot(
   input.projectId
  );
  const sequence=(previous?.sequence||0)+1;
  const id=`evo_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;

  db.prepare(`
   INSERT INTO repository_evolution_snapshots(
    id,project_id,task_id,cycle_id,workspace,sequence,
    fingerprint,parent_fingerprint,file_count,files_json,
    metadata_json,created_at
   )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
   id,
   input.projectId,
   input.taskId||null,
   input.cycleId||null,
   input.workspace,
   sequence,
   input.fingerprint,
   previous?.fingerprint||null,
   input.files.length,
   JSON.stringify([...new Set(input.files)].sort()),
   JSON.stringify(input.metadata||{}),
   now()
  );

  db.exec("COMMIT");
  return getRepositoryEvolutionSnapshot(id)!;
 }catch(error){
  try{db.exec("ROLLBACK");}catch{}
  throw error;
 }
}

export function getRepositoryEvolutionEvent(id:string){
 const row=db.prepare(`
  SELECT * FROM repository_evolution_events WHERE id=?
 `).get(id) as any;
 return row?event(row):null;
}

export function listRepositoryEvolutionEvents(
 projectId:string,
 limit=100
){
 return(db.prepare(`
  SELECT *
  FROM repository_evolution_events
  WHERE project_id=?
  ORDER BY created_at ASC
  LIMIT ?
 `).all(projectId,limit) as any[]).map(event);
}

export function createRepositoryEvolutionEvent(input:{
 projectId:string;
 taskId?:string|null;
 cycleId?:string|null;
 snapshotId?:string|null;
 type:RepositoryEvolutionEventType;
 title:string;
 summary:string;
 files?:string[];
 evidence?:string[];
 metadata?:Record<string,unknown>;
}){
 if(input.snapshotId){
  const linked=getRepositoryEvolutionSnapshot(
   input.snapshotId
  );
  if(!linked)
   throw new Error(
    `Repository evolution snapshot not found: ${input.snapshotId}`
   );
  if(linked.projectId!==input.projectId)
   throw new Error(
    "Repository evolution event snapshot belongs to another project."
   );
 }

 const id=`evt_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;

 db.prepare(`
  INSERT INTO repository_evolution_events(
   id,project_id,task_id,cycle_id,snapshot_id,type,title,
   summary,files_json,evidence_json,metadata_json,created_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  id,
  input.projectId,
  input.taskId||null,
  input.cycleId||null,
  input.snapshotId||null,
  input.type,
  input.title.trim(),
  input.summary.trim(),
  JSON.stringify([...(input.files||[])].sort()),
  JSON.stringify(input.evidence||[]),
  JSON.stringify(input.metadata||{}),
  now()
 );

 return getRepositoryEvolutionEvent(id)!;
}

export function deleteRepositoryEvolutionProject(
 projectId:string
){
 db.exec("BEGIN IMMEDIATE");
 try{
  db.prepare(`
   DELETE FROM repository_evolution_events
   WHERE project_id=?
  `).run(projectId);
  db.prepare(`
   DELETE FROM repository_evolution_snapshots
   WHERE project_id=?
  `).run(projectId);
  db.exec("COMMIT");
 }catch(error){
  try{db.exec("ROLLBACK");}catch{}
  throw error;
 }
}
