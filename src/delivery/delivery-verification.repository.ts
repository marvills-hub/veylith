import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{
 DeliveryRecoveryAction,
 DeliveryVerification,
 DeliveryVerificationStatus
}from"./delivery-verification.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS delivery_verifications(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 goal_id TEXT,
 delivery_plan_id TEXT NOT NULL UNIQUE,
 publication_id TEXT NOT NULL,
 expected_commit TEXT NOT NULL,
 actual_commit TEXT,
 repository_name TEXT NOT NULL,
 target_branch TEXT NOT NULL,
 status TEXT NOT NULL,
 verified INTEGER NOT NULL DEFAULT 0,
 recovery_action TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 error TEXT,
 evidence_json TEXT NOT NULL,
 metadata_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_delivery_verification_project
 ON delivery_verifications(project_id,created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_verification_publication
 ON delivery_verifications(publication_id);
`);

function json<T>(value:any,fallback:T):T{
 try{return value?JSON.parse(String(value)):fallback;}catch{return fallback;}
}
function map(row:any):DeliveryVerification{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  goalId:row.goal_id?String(row.goal_id):null,
  deliveryPlanId:String(row.delivery_plan_id),
  publicationId:String(row.publication_id),
  expectedCommit:String(row.expected_commit),
  actualCommit:row.actual_commit?String(row.actual_commit):null,
  repositoryName:String(row.repository_name),
  targetBranch:String(row.target_branch),
  status:row.status as DeliveryVerificationStatus,
  verified:Boolean(row.verified),
  recoveryAction:row.recovery_action as DeliveryRecoveryAction,
  attempts:Number(row.attempts),
  error:row.error?String(row.error):null,
  evidence:json<string[]>(row.evidence_json,[]),
  metadata:json<Record<string,unknown>>(row.metadata_json,{}),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  verifiedAt:row.verified_at?String(row.verified_at):null
 };
}
export function getDeliveryVerification(id:string){
 const row=db.prepare(`
  SELECT * FROM delivery_verifications WHERE id=?
 `).get(id);
 return row?map(row):null;
}
export function findDeliveryVerificationByPlan(deliveryPlanId:string){
 const row=db.prepare(`
  SELECT *
  FROM delivery_verifications
  WHERE delivery_plan_id=?
  LIMIT 1
 `).get(deliveryPlanId);
 return row?map(row):null;
}
export function latestDeliveryVerification(projectId:string){
 const row=db.prepare(`
  SELECT *
  FROM delivery_verifications
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT 1
 `).get(projectId);
 return row?map(row):null;
}
export function listDeliveryVerifications(projectId:string,limit=100){
 return(db.prepare(`
  SELECT *
  FROM delivery_verifications
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT ?
 `).all(projectId,limit) as any[]).map(map);
}
export function ensureDeliveryVerification(input:{
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 deliveryPlanId:string;
 publicationId:string;
 expectedCommit:string;
 repositoryName:string;
 targetBranch:string;
}){
 const existing=findDeliveryVerificationByPlan(input.deliveryPlanId);
 if(existing)return existing;
 const id=`dvr_${crypto.randomBytes(8).toString("hex")}`;
 const time=now();
 db.prepare(`
  INSERT INTO delivery_verifications(
   id,project_id,task_id,goal_id,delivery_plan_id,publication_id,
   expected_commit,actual_commit,repository_name,target_branch,
   status,verified,recovery_action,attempts,error,evidence_json,
   metadata_json,created_at,updated_at,verified_at
  ) VALUES(?,?,?,?,?,?,?,NULL,?,?,'pending',0,'none',0,NULL,'[]','{}',?,?,NULL)
 `).run(
  id,input.projectId,input.taskId,input.goalId,input.deliveryPlanId,
  input.publicationId,input.expectedCommit,input.repositoryName,
  input.targetBranch,time,time
 );
 return getDeliveryVerification(id)!;
}
export function updateDeliveryVerification(
 id:string,
 patch:{
  actualCommit?:string|null;
  status?:DeliveryVerificationStatus;
  verified?:boolean;
  recoveryAction?:DeliveryRecoveryAction;
  incrementAttempts?:boolean;
  error?:string|null;
  evidence?:string[];
  metadata?:Record<string,unknown>;
 }
){
 const existing=getDeliveryVerification(id);
 if(!existing)throw new Error(`Delivery verification not found: ${id}`);
 const verified=patch.verified??existing.verified;
 const status=patch.status??existing.status;
 const time=now();
 db.prepare(`
  UPDATE delivery_verifications
  SET actual_commit=?,status=?,verified=?,recovery_action=?,
      attempts=?,error=?,evidence_json=?,metadata_json=?,
      updated_at=?,verified_at=?
  WHERE id=?
 `).run(
  patch.actualCommit===undefined?existing.actualCommit:patch.actualCommit,
  status,
  verified?1:0,
  patch.recoveryAction??existing.recoveryAction,
  existing.attempts+(patch.incrementAttempts?1:0),
  patch.error===undefined?existing.error:patch.error,
  JSON.stringify(patch.evidence??existing.evidence),
  JSON.stringify(
   patch.metadata===undefined
    ?existing.metadata
    :{...existing.metadata,...patch.metadata}
  ),
  time,
  verified?(existing.verifiedAt||time):existing.verifiedAt,
  id
 );
 return getDeliveryVerification(id)!;
}
export function deleteDeliveryVerificationsByProject(projectId:string){
 return Number(
  db.prepare(`
   DELETE FROM delivery_verifications WHERE project_id=?
  `).run(projectId).changes
 );
}
