import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{
 DeliveryPlan,
 DeliveryPlanStatus,
 DeliveryReleaseManifest
}from"./delivery-plan.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS delivery_plans(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 goal_id TEXT,
 readiness_id TEXT NOT NULL,
 status TEXT NOT NULL,
 manifest_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 delivered_at TEXT,
 UNIQUE(readiness_id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_plans_project
 ON delivery_plans(project_id,created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_plans_goal
 ON delivery_plans(goal_id,created_at);
`);

function map(row:any):DeliveryPlan{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  goalId:row.goal_id?String(row.goal_id):null,
  readinessId:String(row.readiness_id),
  status:row.status as DeliveryPlanStatus,
  manifest:JSON.parse(String(row.manifest_json)) as DeliveryReleaseManifest,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  deliveredAt:row.delivered_at?String(row.delivered_at):null
 };
}
export function getDeliveryPlan(id:string){
 const row=db.prepare(`
  SELECT * FROM delivery_plans WHERE id=?
 `).get(id);
 return row?map(row):null;
}
export function findDeliveryPlanByReadiness(readinessId:string){
 const row=db.prepare(`
  SELECT *
  FROM delivery_plans
  WHERE readiness_id=?
  LIMIT 1
 `).get(readinessId);
 return row?map(row):null;
}
export function latestDeliveryPlan(projectId:string){
 const row=db.prepare(`
  SELECT *
  FROM delivery_plans
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT 1
 `).get(projectId);
 return row?map(row):null;
}
export function listDeliveryPlans(projectId:string,limit=100){
 return(db.prepare(`
  SELECT *
  FROM delivery_plans
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT ?
 `).all(projectId,limit) as any[]).map(map);
}
export function createDeliveryPlanRecord(input:{
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 readinessId:string;
 manifest:DeliveryReleaseManifest;
}){
 const existing=findDeliveryPlanByReadiness(input.readinessId);
 if(existing)return existing;
 const id=`dlp_${crypto.randomBytes(8).toString("hex")}`;
 const time=now();
 db.prepare(`
  INSERT INTO delivery_plans(
   id,project_id,task_id,goal_id,readiness_id,status,
   manifest_json,created_at,updated_at,delivered_at
  ) VALUES(?,?,?,?,?,'planned',?,?,?,NULL)
 `).run(
  id,input.projectId,input.taskId,input.goalId,input.readinessId,
  JSON.stringify(input.manifest),time,time
 );
 return getDeliveryPlan(id)!;
}
export function setDeliveryPlanStatus(
 id:string,
 status:DeliveryPlanStatus
){
 const existing=getDeliveryPlan(id);
 if(!existing)throw new Error(`Delivery plan not found: ${id}`);
 if(existing.status==="delivered"&&status!=="delivered"){
  throw new Error("Delivered delivery plan is terminal.");
 }
 const time=now();
 db.prepare(`
  UPDATE delivery_plans
  SET status=?,updated_at=?,delivered_at=?
  WHERE id=?
 `).run(
  status,
  time,
  status==="delivered"?time:existing.deliveredAt,
  id
 );
 return getDeliveryPlan(id)!;
}
export function deleteDeliveryPlansByProject(projectId:string){
 return Number(
  db.prepare("DELETE FROM delivery_plans WHERE project_id=?")
   .run(projectId).changes
 );
}
