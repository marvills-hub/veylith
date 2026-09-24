import crypto from"node:crypto";
import{db}from"../../../database/database.js";
import{now}from"../../../config/config.js";
import type{
 AutonomousLifecycleCheckpoint,
 AutonomousLifecycleStage,
 AutonomousLifecycleStatus
}from"./lifecycle.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS autonomous_lifecycle_checkpoints(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 goal_id TEXT NOT NULL UNIQUE,
 stage TEXT NOT NULL,
 status TEXT NOT NULL,
 task_id TEXT,
 work_item_id TEXT,
 delivery_plan_id TEXT,
 publication_id TEXT,
 verification_id TEXT,
 release_id TEXT,
 error TEXT,
 metadata_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_autonomous_lifecycle_project
 ON autonomous_lifecycle_checkpoints(project_id);
CREATE INDEX IF NOT EXISTS idx_autonomous_lifecycle_status
 ON autonomous_lifecycle_checkpoints(status);
`);

function parse(value:any){
 try{return JSON.parse(String(value||"{}"));}catch{return{};}
}

function map(row:any):AutonomousLifecycleCheckpoint{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  goalId:String(row.goal_id),
  stage:row.stage,
  status:row.status,
  taskId:row.task_id?String(row.task_id):null,
  workItemId:row.work_item_id?String(row.work_item_id):null,
  deliveryPlanId:row.delivery_plan_id?String(row.delivery_plan_id):null,
  publicationId:row.publication_id?String(row.publication_id):null,
  verificationId:row.verification_id?String(row.verification_id):null,
  releaseId:row.release_id?String(row.release_id):null,
  error:row.error?String(row.error):null,
  metadata:parse(row.metadata_json),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  completedAt:row.completed_at?String(row.completed_at):null
 };
}

export function lifecycleCheckpoint(goalId:string){
 const row=db.prepare(`
  SELECT * FROM autonomous_lifecycle_checkpoints WHERE goal_id=?
 `).get(goalId);
 return row?map(row):null;
}

export function ensureLifecycleCheckpoint(input:{
 projectId:string;
 goalId:string;
 stage?:AutonomousLifecycleStage;
 taskId?:string|null;
 workItemId?:string|null;
}){
 const existing=lifecycleCheckpoint(input.goalId);
 if(existing)return existing;
 const time=now();
 const id=`alc_${crypto.randomBytes(8).toString("hex")}`;
 db.prepare(`
  INSERT INTO autonomous_lifecycle_checkpoints(
   id,project_id,goal_id,stage,status,task_id,work_item_id,
   metadata_json,created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?)
 `).run(
  id,
  input.projectId,
  input.goalId,
  input.stage??"development",
  "running",
  input.taskId??null,
  input.workItemId??null,
  "{}",
  time,
  time
 );
 return lifecycleCheckpoint(input.goalId)!;
}

export function updateLifecycleCheckpoint(
 goalId:string,
 input:{
  stage?:AutonomousLifecycleStage;
  status?:AutonomousLifecycleStatus;
  taskId?:string|null;
  workItemId?:string|null;
  deliveryPlanId?:string|null;
  publicationId?:string|null;
  verificationId?:string|null;
  releaseId?:string|null;
  error?:string|null;
  metadata?:Record<string,any>;
  completed?:boolean;
 }
){
 const current=lifecycleCheckpoint(goalId);
 if(!current)throw new Error(`Lifecycle checkpoint not found: ${goalId}`);
 const time=now();
 db.prepare(`
  UPDATE autonomous_lifecycle_checkpoints
  SET stage=?,
      status=?,
      task_id=?,
      work_item_id=?,
      delivery_plan_id=?,
      publication_id=?,
      verification_id=?,
      release_id=?,
      error=?,
      metadata_json=?,
      updated_at=?,
      completed_at=?
  WHERE goal_id=?
 `).run(
  input.stage??current.stage,
  input.status??current.status,
  input.taskId===undefined?current.taskId:input.taskId,
  input.workItemId===undefined?current.workItemId:input.workItemId,
  input.deliveryPlanId===undefined?current.deliveryPlanId:input.deliveryPlanId,
  input.publicationId===undefined?current.publicationId:input.publicationId,
  input.verificationId===undefined?current.verificationId:input.verificationId,
  input.releaseId===undefined?current.releaseId:input.releaseId,
  input.error===undefined?current.error:input.error,
  JSON.stringify(input.metadata??current.metadata),
  time,
  input.completed?time:current.completedAt,
  goalId
 );
 return lifecycleCheckpoint(goalId)!;
}

export function listRecoverableLifecycles(){
 return(db.prepare(`
  SELECT *
  FROM autonomous_lifecycle_checkpoints
  WHERE status IN('running','waiting','delivering')
  ORDER BY updated_at,id
 `).all() as any[]).map(map);
}
