import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{
 RepositoryConvention,
 RepositoryConventionCategory,
 RepositoryConventionConfidence
}from"./repository-convention.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS repository_conventions(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 category TEXT NOT NULL,
 convention_key TEXT NOT NULL,
 value TEXT NOT NULL,
 confidence TEXT NOT NULL,
 samples_json TEXT NOT NULL DEFAULT '[]',
 evidence_count INTEGER NOT NULL DEFAULT 0,
 source_fingerprint TEXT NOT NULL,
 metadata_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(project_id,convention_key)
);
CREATE INDEX IF NOT EXISTS idx_repository_conventions_project
ON repository_conventions(project_id,category,updated_at DESC);
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

function map(row:any):RepositoryConvention{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  category:String(row.category) as RepositoryConventionCategory,
  key:String(row.convention_key),
  value:String(row.value),
  confidence:String(row.confidence) as RepositoryConventionConfidence,
  samples:array(row.samples_json),
  evidenceCount:Number(row.evidence_count||0),
  sourceFingerprint:String(row.source_fingerprint),
  metadata:object(row.metadata_json),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}

export function getRepositoryConvention(id:string){
 const row=db.prepare(`
  SELECT * FROM repository_conventions WHERE id=?
 `).get(id) as any;
 return row?map(row):null;
}

export function findRepositoryConvention(
 projectId:string,
 key:string
){
 const row=db.prepare(`
  SELECT *
  FROM repository_conventions
  WHERE project_id=? AND convention_key=?
  LIMIT 1
 `).get(projectId,key) as any;
 return row?map(row):null;
}

export function listRepositoryConventions(
 projectId:string,
 category?:RepositoryConventionCategory,
 limit=100
){
 const rows=category
  ?db.prepare(`
    SELECT *
    FROM repository_conventions
    WHERE project_id=? AND category=?
    ORDER BY convention_key ASC
    LIMIT ?
   `).all(projectId,category,limit)
  :db.prepare(`
    SELECT *
    FROM repository_conventions
    WHERE project_id=?
    ORDER BY category ASC,convention_key ASC
    LIMIT ?
   `).all(projectId,limit);

 return(rows as any[]).map(map);
}

export function upsertRepositoryConvention(input:{
 projectId:string;
 category:RepositoryConventionCategory;
 key:string;
 value:string;
 confidence:RepositoryConventionConfidence;
 samples:string[];
 evidenceCount:number;
 sourceFingerprint:string;
 metadata?:Record<string,unknown>;
}){
 const existing=findRepositoryConvention(
  input.projectId,
  input.key
 );
 const time=now();

 if(existing){
  db.prepare(`
   UPDATE repository_conventions
   SET category=?,
       value=?,
       confidence=?,
       samples_json=?,
       evidence_count=?,
       source_fingerprint=?,
       metadata_json=?,
       updated_at=?
   WHERE id=?
  `).run(
   input.category,
   input.value,
   input.confidence,
   JSON.stringify([...new Set(input.samples)].slice(0,12)),
   input.evidenceCount,
   input.sourceFingerprint,
   JSON.stringify(input.metadata||{}),
   time,
   existing.id
  );
  return getRepositoryConvention(existing.id)!;
 }

 const id=`cnv_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;

 db.prepare(`
  INSERT INTO repository_conventions(
   id,project_id,category,convention_key,value,
   confidence,samples_json,evidence_count,
   source_fingerprint,metadata_json,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  id,
  input.projectId,
  input.category,
  input.key,
  input.value,
  input.confidence,
  JSON.stringify([...new Set(input.samples)].slice(0,12)),
  input.evidenceCount,
  input.sourceFingerprint,
  JSON.stringify(input.metadata||{}),
  time,
  time
 );

 return getRepositoryConvention(id)!;
}

export function deleteRepositoryConventionsByProject(
 projectId:string
){
 db.prepare(`
  DELETE FROM repository_conventions
  WHERE project_id=?
 `).run(projectId);
}
