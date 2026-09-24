import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{
 DeliveryCommitPreparation,
 DeliveryCommitStatus
}from"./delivery-commit.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS delivery_commit_preparations(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 goal_id TEXT,
 delivery_plan_id TEXT NOT NULL UNIQUE,
 readiness_id TEXT NOT NULL,
 workspace TEXT NOT NULL,
 repository_fingerprint TEXT NOT NULL,
 commit_hash TEXT NOT NULL,
 commit_message TEXT NOT NULL,
 created INTEGER NOT NULL DEFAULT 0,
 changed_files INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL,
 metadata_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_commit_project
 ON delivery_commit_preparations(project_id,created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_commit_hash
 ON delivery_commit_preparations(commit_hash);
`);

function json(value:any){
 try{return value?JSON.parse(String(value)):{};}catch{return{};}
}
function map(row:any):DeliveryCommitPreparation{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  goalId:row.goal_id?String(row.goal_id):null,
  deliveryPlanId:String(row.delivery_plan_id),
  readinessId:String(row.readiness_id),
  workspace:String(row.workspace),
  repositoryFingerprint:String(row.repository_fingerprint),
  commit:String(row.commit_hash),
  commitMessage:String(row.commit_message),
  created:Boolean(row.created),
  changedFiles:Number(row.changed_files),
  status:row.status as DeliveryCommitStatus,
  metadata:json(row.metadata_json),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}
export function getDeliveryCommitPreparation(id:string){
 const row=db.prepare(`
  SELECT * FROM delivery_commit_preparations WHERE id=?
 `).get(id);
 return row?map(row):null;
}
export function findDeliveryCommitByPlan(deliveryPlanId:string){
 const row=db.prepare(`
  SELECT *
  FROM delivery_commit_preparations
  WHERE delivery_plan_id=?
  LIMIT 1
 `).get(deliveryPlanId);
 return row?map(row):null;
}
export function latestDeliveryCommitPreparation(projectId:string){
 const row=db.prepare(`
  SELECT *
  FROM delivery_commit_preparations
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT 1
 `).get(projectId);
 return row?map(row):null;
}
export function listDeliveryCommitPreparations(
 projectId:string,
 limit=100
){
 return(db.prepare(`
  SELECT *
  FROM delivery_commit_preparations
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT ?
 `).all(projectId,limit) as any[]).map(map);
}
export function createDeliveryCommitPreparation(input:{
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 deliveryPlanId:string;
 readinessId:string;
 workspace:string;
 repositoryFingerprint:string;
 commit:string;
 commitMessage:string;
 created:boolean;
 changedFiles:number;
 metadata?:Record<string,unknown>;
}){
 const existing=findDeliveryCommitByPlan(input.deliveryPlanId);
 if(existing)return existing;
 const id=`dcp_${crypto.randomBytes(8).toString("hex")}`;
 const time=now();
 db.prepare(`
  INSERT INTO delivery_commit_preparations(
   id,project_id,task_id,goal_id,delivery_plan_id,readiness_id,
   workspace,repository_fingerprint,commit_hash,commit_message,
   created,changed_files,status,metadata_json,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  id,input.projectId,input.taskId,input.goalId,input.deliveryPlanId,
  input.readinessId,input.workspace,input.repositoryFingerprint,
  input.commit,input.commitMessage,input.created?1:0,input.changedFiles,
  "prepared",JSON.stringify(input.metadata||{}),time,time
 );
 return getDeliveryCommitPreparation(id)!;
}
export function setDeliveryCommitStatus(
 id:string,
 status:DeliveryCommitStatus
){
 const existing=getDeliveryCommitPreparation(id);
 if(!existing)throw new Error(`Delivery commit preparation not found: ${id}`);
 const time=now();
 db.prepare(`
  UPDATE delivery_commit_preparations
  SET status=?,updated_at=?
  WHERE id=?
 `).run(status,time,id);
 return getDeliveryCommitPreparation(id)!;
}
export function deleteDeliveryCommitPreparationsByProject(projectId:string){
 return Number(
  db.prepare(`
   DELETE FROM delivery_commit_preparations WHERE project_id=?
  `).run(projectId).changes
 );
}
