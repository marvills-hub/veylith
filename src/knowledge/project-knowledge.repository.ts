import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{
 ProjectKnowledge,
 ProjectKnowledgeStatus,
 ProjectKnowledgeType
}from"./project-knowledge.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS project_knowledge(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 snapshot_id TEXT,
 evolution_event_id TEXT,
 type TEXT NOT NULL,
 status TEXT NOT NULL,
 knowledge_key TEXT NOT NULL,
 title TEXT NOT NULL,
 summary TEXT NOT NULL,
 rationale TEXT NOT NULL DEFAULT '',
 affected_files_json TEXT NOT NULL DEFAULT '[]',
 constraints_json TEXT NOT NULL DEFAULT '[]',
 consequences_json TEXT NOT NULL DEFAULT '[]',
 evidence_json TEXT NOT NULL DEFAULT '[]',
 supersedes_id TEXT,
 superseded_by_id TEXT,
 metadata_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_project
ON project_knowledge(project_id,status,type,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_key
ON project_knowledge(project_id,knowledge_key,status);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_snapshot
ON project_knowledge(snapshot_id);
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

function map(row:any):ProjectKnowledge{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  snapshotId:row.snapshot_id?String(row.snapshot_id):null,
  evolutionEventId:row.evolution_event_id
   ?String(row.evolution_event_id)
   :null,
  type:String(row.type) as ProjectKnowledgeType,
  status:String(row.status) as ProjectKnowledgeStatus,
  key:String(row.knowledge_key),
  title:String(row.title),
  summary:String(row.summary),
  rationale:String(row.rationale||""),
  affectedFiles:array(row.affected_files_json),
  constraints:array(row.constraints_json),
  consequences:array(row.consequences_json),
  evidence:array(row.evidence_json),
  supersedesId:row.supersedes_id?String(row.supersedes_id):null,
  supersededById:row.superseded_by_id
   ?String(row.superseded_by_id)
   :null,
  metadata:object(row.metadata_json),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}

export function getProjectKnowledge(id:string){
 const row=db.prepare(`
  SELECT * FROM project_knowledge WHERE id=?
 `).get(id) as any;
 return row?map(row):null;
}

export function listProjectKnowledge(
 projectId:string,
 options:{
  status?:ProjectKnowledgeStatus;
  type?:ProjectKnowledgeType;
  limit?:number;
 }={}
){
 const conditions=["project_id=?"];
 const values:any[]=[projectId];

 if(options.status){
  conditions.push("status=?");
  values.push(options.status);
 }

 if(options.type){
  conditions.push("type=?");
  values.push(options.type);
 }

 const limit=Math.max(1,options.limit||100);
 values.push(limit);

 return(db.prepare(`
  SELECT *
  FROM project_knowledge
  WHERE ${conditions.join(" AND ")}
  ORDER BY created_at ASC
  LIMIT ?
 `).all(...values) as any[]).map(map);
}

export function findActiveProjectKnowledge(
 projectId:string,
 key:string
){
 const row=db.prepare(`
  SELECT *
  FROM project_knowledge
  WHERE project_id=?
   AND knowledge_key=?
   AND status='active'
  ORDER BY created_at DESC
  LIMIT 1
 `).get(projectId,key) as any;
 return row?map(row):null;
}

export function createProjectKnowledge(input:{
 projectId:string;
 taskId?:string|null;
 snapshotId?:string|null;
 evolutionEventId?:string|null;
 type:ProjectKnowledgeType;
 key:string;
 title:string;
 summary:string;
 rationale?:string;
 affectedFiles?:string[];
 constraints?:string[];
 consequences?:string[];
 evidence?:string[];
 supersedesId?:string|null;
 metadata?:Record<string,unknown>;
}){
 const key=input.key.trim();
 const title=input.title.trim();
 const summary=input.summary.trim();

 if(!key)throw new Error("Project knowledge key is required.");
 if(!title)throw new Error("Project knowledge title is required.");
 if(!summary)throw new Error("Project knowledge summary is required.");

 if(input.snapshotId){
  const snapshot=db.prepare(`
   SELECT project_id
   FROM repository_evolution_snapshots
   WHERE id=?
  `).get(input.snapshotId) as any;

  if(!snapshot)
   throw new Error(`Repository evolution snapshot not found: ${input.snapshotId}`);

  if(String(snapshot.project_id)!==input.projectId)
   throw new Error("Project knowledge snapshot belongs to another project.");
 }

 if(input.evolutionEventId){
  const event=db.prepare(`
   SELECT project_id
   FROM repository_evolution_events
   WHERE id=?
  `).get(input.evolutionEventId) as any;

  if(!event)
   throw new Error(`Repository evolution event not found: ${input.evolutionEventId}`);

  if(String(event.project_id)!==input.projectId)
   throw new Error("Project knowledge evolution event belongs to another project.");
 }

 if(input.supersedesId){
  const previous=getProjectKnowledge(input.supersedesId);
  if(!previous)
   throw new Error(`Superseded project knowledge not found: ${input.supersedesId}`);
  if(previous.projectId!==input.projectId)
   throw new Error("Superseded project knowledge belongs to another project.");
  if(previous.status!=="active")
   throw new Error("Only active project knowledge can be superseded.");
 }

 const id=`knw_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;
 const time=now();

 db.exec("BEGIN IMMEDIATE");
 try{
  db.prepare(`
   INSERT INTO project_knowledge(
    id,project_id,task_id,snapshot_id,evolution_event_id,
    type,status,knowledge_key,title,summary,rationale,
    affected_files_json,constraints_json,consequences_json,
    evidence_json,supersedes_id,superseded_by_id,
    metadata_json,created_at,updated_at
   )VALUES(?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?,?,NULL,?,?,?)
  `).run(
   id,
   input.projectId,
   input.taskId||null,
   input.snapshotId||null,
   input.evolutionEventId||null,
   input.type,
   key,
   title,
   summary,
   input.rationale?.trim()||"",
   JSON.stringify([...new Set(input.affectedFiles||[])].sort()),
   JSON.stringify(input.constraints||[]),
   JSON.stringify(input.consequences||[]),
   JSON.stringify(input.evidence||[]),
   input.supersedesId||null,
   JSON.stringify(input.metadata||{}),
   time,
   time
  );

  if(input.supersedesId){
   db.prepare(`
    UPDATE project_knowledge
    SET status='superseded',
        superseded_by_id=?,
        updated_at=?
    WHERE id=?
   `).run(id,time,input.supersedesId);
  }

  db.exec("COMMIT");
 }catch(error){
  try{db.exec("ROLLBACK");}catch{}
  throw error;
 }

 return getProjectKnowledge(id)!;
}

export function retireProjectKnowledge(id:string){
 const current=getProjectKnowledge(id);
 if(!current)
  throw new Error(`Project knowledge not found: ${id}`);

 if(current.status==="superseded")
  throw new Error("Superseded project knowledge cannot be retired.");

 if(current.status==="retired")return current;

 db.prepare(`
  UPDATE project_knowledge
  SET status='retired',updated_at=?
  WHERE id=?
 `).run(now(),id);

 return getProjectKnowledge(id)!;
}

export function deleteProjectKnowledgeByProject(projectId:string){
 db.prepare(`
  DELETE FROM project_knowledge
  WHERE project_id=?
 `).run(projectId);
}
