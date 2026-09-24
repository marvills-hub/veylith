import crypto from"node:crypto";
import{db}from"../../database/database.js";
import{now}from"../../config/config.js";
import type{
 ValidationEscalation,
 ValidationEscalationReason,
 ValidationEscalationSeverity,
 ValidationEscalationStatus
}from"./validation-escalation.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS validation_escalations(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 run_id TEXT,
 repair_attempt_id TEXT,
 reason TEXT NOT NULL,
 severity TEXT NOT NULL,
 status TEXT NOT NULL,
 fingerprint TEXT,
 repair_attempts INTEGER NOT NULL DEFAULT 0,
 unchanged_failures INTEGER NOT NULL DEFAULT 0,
 regressions INTEGER NOT NULL DEFAULT 0,
 summary TEXT NOT NULL,
 metadata_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_validation_escalations_project
ON validation_escalations(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_escalations_task
ON validation_escalations(task_id,status);
CREATE INDEX IF NOT EXISTS idx_validation_escalations_fingerprint
ON validation_escalations(project_id,fingerprint,status);
`);

function metadata(value:any):Record<string,unknown>{
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

function map(row:any):ValidationEscalation{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  runId:row.run_id?String(row.run_id):null,
  repairAttemptId:row.repair_attempt_id
   ?String(row.repair_attempt_id)
   :null,
  reason:String(row.reason) as ValidationEscalationReason,
  severity:String(row.severity) as ValidationEscalationSeverity,
  status:String(row.status) as ValidationEscalationStatus,
  fingerprint:row.fingerprint?String(row.fingerprint):null,
  repairAttempts:Number(row.repair_attempts||0),
  unchangedFailures:Number(row.unchanged_failures||0),
  regressions:Number(row.regressions||0),
  summary:String(row.summary||""),
  metadata:metadata(row.metadata_json),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  resolvedAt:row.resolved_at?String(row.resolved_at):null
 };
}

export function getValidationEscalation(id:string){
 const row=db.prepare(`
  SELECT * FROM validation_escalations WHERE id=?
 `).get(id) as any;
 return row?map(row):null;
}

export function getOpenValidationEscalation(
 projectId:string,
 taskId:string|null,
 reason:ValidationEscalationReason,
 fingerprint:string|null
){
 const row=db.prepare(`
  SELECT *
  FROM validation_escalations
  WHERE project_id=?
   AND COALESCE(task_id,'')=COALESCE(?,'')
   AND reason=?
   AND COALESCE(fingerprint,'')=COALESCE(?,'')
   AND status='open'
  ORDER BY created_at DESC
  LIMIT 1
 `).get(
  projectId,
  taskId,
  reason,
  fingerprint
 ) as any;

 return row?map(row):null;
}

export function listProjectValidationEscalations(
 projectId:string
){
 return(db.prepare(`
  SELECT *
  FROM validation_escalations
  WHERE project_id=?
  ORDER BY created_at ASC
 `).all(projectId) as any[]).map(map);
}

export function createValidationEscalation(input:{
 projectId:string;
 taskId?:string|null;
 runId?:string|null;
 repairAttemptId?:string|null;
 reason:ValidationEscalationReason;
 severity:ValidationEscalationSeverity;
 fingerprint?:string|null;
 repairAttempts?:number;
 unchangedFailures?:number;
 regressions?:number;
 summary:string;
 metadata?:Record<string,unknown>;
}){
 const existing=getOpenValidationEscalation(
  input.projectId,
  input.taskId||null,
  input.reason,
  input.fingerprint||null
 );

 if(existing)return existing;

 const id=`esc_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;
 const time=now();

 db.prepare(`
  INSERT INTO validation_escalations(
   id,project_id,task_id,run_id,repair_attempt_id,
   reason,severity,status,fingerprint,
   repair_attempts,unchanged_failures,regressions,
   summary,metadata_json,created_at,updated_at,resolved_at
  )VALUES(?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?, ?,NULL)
 `).run(
  id,
  input.projectId,
  input.taskId||null,
  input.runId||null,
  input.repairAttemptId||null,
  input.reason,
  input.severity,
  input.fingerprint||null,
  input.repairAttempts||0,
  input.unchangedFailures||0,
  input.regressions||0,
  input.summary,
  JSON.stringify(input.metadata||{}),
  time,
  time
 );

 return getValidationEscalation(id)!;
}

export function resolveValidationEscalation(id:string){
 const current=getValidationEscalation(id);
 if(!current)
  throw new Error(`Validation escalation not found: ${id}`);

 if(current.status==="resolved")return current;

 const time=now();

 db.prepare(`
  UPDATE validation_escalations
  SET status='resolved',
      updated_at=?,
      resolved_at=?
  WHERE id=?
 `).run(time,time,id);

 return getValidationEscalation(id)!;
}

export function deleteValidationEscalationsByProject(
 projectId:string
){
 db.prepare(`
  DELETE FROM validation_escalations
  WHERE project_id=?
 `).run(projectId);
}
