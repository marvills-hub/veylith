import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{DeliveryReadinessAssessment,DeliveryReadinessCheck,DeliveryReadinessStatus}from"./delivery-readiness.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS delivery_readiness_assessments(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 goal_id TEXT,
 workspace TEXT NOT NULL,
 status TEXT NOT NULL,
 ready INTEGER NOT NULL DEFAULT 0,
 checks_json TEXT NOT NULL,
 blockers_json TEXT NOT NULL,
 evidence_json TEXT NOT NULL,
 metadata_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_readiness_project
 ON delivery_readiness_assessments(project_id,created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_readiness_goal
 ON delivery_readiness_assessments(goal_id,created_at);
`);

function json<T>(value:any,fallback:T):T{
 try{return value?JSON.parse(String(value)):fallback;}catch{return fallback;}
}
function map(row:any):DeliveryReadinessAssessment{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  goalId:row.goal_id?String(row.goal_id):null,
  workspace:String(row.workspace),
  status:row.status as DeliveryReadinessStatus,
  ready:Boolean(row.ready),
  checks:json<DeliveryReadinessCheck[]>(row.checks_json,[]),
  blockers:json<string[]>(row.blockers_json,[]),
  evidence:json<string[]>(row.evidence_json,[]),
  metadata:json<Record<string,unknown>>(row.metadata_json,{}),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}
export function getDeliveryReadiness(id:string){
 const row=db.prepare(`
  SELECT * FROM delivery_readiness_assessments WHERE id=?
 `).get(id);
 return row?map(row):null;
}
export function latestDeliveryReadiness(projectId:string){
 const row=db.prepare(`
  SELECT *
  FROM delivery_readiness_assessments
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT 1
 `).get(projectId);
 return row?map(row):null;
}
export function listDeliveryReadiness(projectId:string,limit=100){
 return(db.prepare(`
  SELECT *
  FROM delivery_readiness_assessments
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT ?
 `).all(projectId,limit) as any[]).map(map);
}
export function createDeliveryReadiness(input:{
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 workspace:string;
 status:DeliveryReadinessStatus;
 ready:boolean;
 checks:DeliveryReadinessCheck[];
 blockers:string[];
 evidence:string[];
 metadata:Record<string,unknown>;
}){
 const id=`dry_${crypto.randomBytes(8).toString("hex")}`;
 const time=now();
 db.prepare(`
  INSERT INTO delivery_readiness_assessments(
   id,project_id,task_id,goal_id,workspace,status,ready,
   checks_json,blockers_json,evidence_json,metadata_json,
   created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  id,input.projectId,input.taskId,input.goalId,input.workspace,
  input.status,input.ready?1:0,JSON.stringify(input.checks),
  JSON.stringify(input.blockers),JSON.stringify(input.evidence),
  JSON.stringify(input.metadata),time,time
 );
 return getDeliveryReadiness(id)!;
}
export function deleteDeliveryReadinessByProject(projectId:string){
 return Number(
  db.prepare(`
   DELETE FROM delivery_readiness_assessments WHERE project_id=?
  `).run(projectId).changes
 );
}
