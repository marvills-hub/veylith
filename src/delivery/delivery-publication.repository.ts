import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{
 DeliveryPublication,
 DeliveryPublicationStatus
}from"./delivery-publication.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS delivery_publications(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 goal_id TEXT,
 delivery_plan_id TEXT NOT NULL UNIQUE,
 commit_preparation_id TEXT NOT NULL UNIQUE,
 readiness_id TEXT NOT NULL,
 workspace TEXT NOT NULL,
 repository_name TEXT NOT NULL,
 target_branch TEXT NOT NULL,
 visibility TEXT NOT NULL,
 commit_hash TEXT NOT NULL,
 repository_fingerprint TEXT NOT NULL,
 status TEXT NOT NULL,
 github_json TEXT,
 error TEXT,
 metadata_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_delivery_publication_project
 ON delivery_publications(project_id,created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_publication_commit
 ON delivery_publications(commit_hash);
`);

function json<T>(value:any,fallback:T):T{
 try{return value?JSON.parse(String(value)):fallback;}catch{return fallback;}
}
function map(row:any):DeliveryPublication{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  goalId:row.goal_id?String(row.goal_id):null,
  deliveryPlanId:String(row.delivery_plan_id),
  commitPreparationId:String(row.commit_preparation_id),
  readinessId:String(row.readiness_id),
  workspace:String(row.workspace),
  repositoryName:String(row.repository_name),
  targetBranch:String(row.target_branch),
  visibility:row.visibility as"private"|"public",
  commit:String(row.commit_hash),
  repositoryFingerprint:String(row.repository_fingerprint),
  status:row.status as DeliveryPublicationStatus,
  github:json<Record<string,unknown>|null>(row.github_json,null),
  error:row.error?String(row.error):null,
  metadata:json<Record<string,unknown>>(row.metadata_json,{}),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  publishedAt:row.published_at?String(row.published_at):null
 };
}
export function getDeliveryPublication(id:string){
 const row=db.prepare(`
  SELECT * FROM delivery_publications WHERE id=?
 `).get(id);
 return row?map(row):null;
}
export function findDeliveryPublicationByPlan(deliveryPlanId:string){
 const row=db.prepare(`
  SELECT *
  FROM delivery_publications
  WHERE delivery_plan_id=?
  LIMIT 1
 `).get(deliveryPlanId);
 return row?map(row):null;
}
export function latestDeliveryPublication(projectId:string){
 const row=db.prepare(`
  SELECT *
  FROM delivery_publications
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT 1
 `).get(projectId);
 return row?map(row):null;
}
export function listDeliveryPublications(projectId:string,limit=100){
 return(db.prepare(`
  SELECT *
  FROM delivery_publications
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT ?
 `).all(projectId,limit) as any[]).map(map);
}
export function createDeliveryPublication(input:{
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 deliveryPlanId:string;
 commitPreparationId:string;
 readinessId:string;
 workspace:string;
 repositoryName:string;
 targetBranch:string;
 visibility:"private"|"public";
 commit:string;
 repositoryFingerprint:string;
 metadata?:Record<string,unknown>;
}){
 const existing=findDeliveryPublicationByPlan(input.deliveryPlanId);
 if(existing)return existing;
 const id=`dpb_${crypto.randomBytes(8).toString("hex")}`;
 const time=now();
 db.prepare(`
  INSERT INTO delivery_publications(
   id,project_id,task_id,goal_id,delivery_plan_id,
   commit_preparation_id,readiness_id,workspace,
   repository_name,target_branch,visibility,commit_hash,
   repository_fingerprint,status,github_json,error,
   metadata_json,created_at,updated_at,published_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'authorized',NULL,NULL,?,?,?,NULL)
 `).run(
  id,input.projectId,input.taskId,input.goalId,input.deliveryPlanId,
  input.commitPreparationId,input.readinessId,input.workspace,
  input.repositoryName,input.targetBranch,input.visibility,input.commit,
  input.repositoryFingerprint,JSON.stringify(input.metadata||{}),
  time,time
 );
 return getDeliveryPublication(id)!;
}
export function updateDeliveryPublication(
 id:string,
 patch:{
  status?:DeliveryPublicationStatus;
  github?:Record<string,unknown>|null;
  error?:string|null;
  metadata?:Record<string,unknown>;
 }
){
 const existing=getDeliveryPublication(id);
 if(!existing)throw new Error(`Delivery publication not found: ${id}`);
 const status=patch.status??existing.status;
 const github=patch.github===undefined?existing.github:patch.github;
 const error=patch.error===undefined?existing.error:patch.error;
 const metadata=patch.metadata===undefined
  ?existing.metadata
  :{...existing.metadata,...patch.metadata};
 const time=now();
 db.prepare(`
  UPDATE delivery_publications
  SET status=?,github_json=?,error=?,metadata_json=?,
      updated_at=?,published_at=?
  WHERE id=?
 `).run(
  status,
  github===null?null:JSON.stringify(github),
  error,
  JSON.stringify(metadata),
  time,
  status==="published"?(existing.publishedAt||time):existing.publishedAt,
  id
 );
 return getDeliveryPublication(id)!;
}
export function deleteDeliveryPublicationsByProject(projectId:string){
 return Number(
  db.prepare(`
   DELETE FROM delivery_publications WHERE project_id=?
  `).run(projectId).changes
 );
}
