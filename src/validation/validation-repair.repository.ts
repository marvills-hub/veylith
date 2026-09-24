import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{DevelopmentResult}from"../orchestration/pipeline.types.js";
import type{
 ValidationRepairAttempt,
 ValidationRepairStatus
}from"./validation-repair.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS validation_repair_attempts(
 id TEXT PRIMARY KEY,
 run_id TEXT NOT NULL,
 diagnostic_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 task_id TEXT,
 attempt INTEGER NOT NULL,
 status TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 failure_kind TEXT NOT NULL,
 scope TEXT NOT NULL,
 repair_json TEXT,
 files_json TEXT NOT NULL DEFAULT '[]',
 error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 completed_at TEXT,
 UNIQUE(diagnostic_id,attempt)
);
CREATE INDEX IF NOT EXISTS idx_validation_repairs_run
ON validation_repair_attempts(run_id,attempt);
CREATE INDEX IF NOT EXISTS idx_validation_repairs_project
ON validation_repair_attempts(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_repairs_fingerprint
ON validation_repair_attempts(project_id,fingerprint,attempt);
`);

function parse<T>(value:any,fallback:T):T{
 if(value===null||value===undefined||value==="")return fallback;
 try{return JSON.parse(String(value)) as T;}catch{return fallback;}
}

function map(row:any):ValidationRepairAttempt{
 return{
  id:String(row.id),
  runId:String(row.run_id),
  diagnosticId:String(row.diagnostic_id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  attempt:Number(row.attempt),
  status:String(row.status) as ValidationRepairStatus,
  fingerprint:String(row.fingerprint),
  failureKind:String(row.failure_kind),
  scope:row.scope,
  repair:parse<DevelopmentResult|null>(row.repair_json,null),
  files:parse<string[]>(row.files_json,[]),
  error:row.error?String(row.error):null,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  completedAt:row.completed_at?String(row.completed_at):null
 };
}

export function getValidationRepairAttempt(id:string){
 const row=db.prepare(`
  SELECT * FROM validation_repair_attempts WHERE id=?
 `).get(id) as any;
 return row?map(row):null;
}

export function getDiagnosticRepairAttempt(diagnosticId:string,attempt:number){
 const row=db.prepare(`
  SELECT * FROM validation_repair_attempts
  WHERE diagnostic_id=? AND attempt=?
 `).get(diagnosticId,attempt) as any;
 return row?map(row):null;
}

export function getLatestDiagnosticRepairAttempt(diagnosticId:string){
 const row=db.prepare(`
  SELECT * FROM validation_repair_attempts
  WHERE diagnostic_id=?
  ORDER BY attempt DESC
  LIMIT 1
 `).get(diagnosticId) as any;
 return row?map(row):null;
}

export function listRunValidationRepairs(runId:string){
 return(db.prepare(`
  SELECT * FROM validation_repair_attempts
  WHERE run_id=?
  ORDER BY attempt ASC
 `).all(runId) as any[]).map(map);
}

export function listFingerprintValidationRepairs(projectId:string,fingerprint:string,limit=100){
 return(db.prepare(`
  SELECT * FROM validation_repair_attempts
  WHERE project_id=? AND fingerprint=?
  ORDER BY created_at ASC,attempt ASC
  LIMIT ?
 `).all(projectId,fingerprint,limit) as any[]).map(map);
}

export function createValidationRepairAttempt(input:{
 runId:string;
 diagnosticId:string;
 projectId:string;
 taskId?:string|null;
 attempt:number;
 fingerprint:string;
 failureKind:string;
 scope:"focused"|"expanded"|"broad";
 status?:ValidationRepairStatus;
}){
 const existing=getDiagnosticRepairAttempt(input.diagnosticId,input.attempt);
 if(existing)return existing;
 const id=`vrepair_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;
 const time=now();
 db.prepare(`
  INSERT INTO validation_repair_attempts(
   id,run_id,diagnostic_id,project_id,task_id,attempt,status,
   fingerprint,failure_kind,scope,repair_json,files_json,error,
   created_at,updated_at,completed_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,NULL,'[]',NULL,?,?,NULL)
 `).run(
  id,input.runId,input.diagnosticId,input.projectId,input.taskId||null,
  input.attempt,input.status||"pending",input.fingerprint,
  input.failureKind,input.scope,time,time
 );
 return getValidationRepairAttempt(id)!;
}

export function setValidationRepairAttemptState(
 id:string,
 status:ValidationRepairStatus,
 input?:{
  repair?:DevelopmentResult|null;
  files?:string[];
  error?:string|null;
 }
){
 const current=getValidationRepairAttempt(id);
 if(!current)throw new Error(`Validation repair attempt not found: ${id}`);
 const terminal=["applied","failed","blocked"].includes(status);
 const repair=input&&"repair"in input?input.repair:current.repair;
 const files=input?.files??current.files;
 const error=input&&"error"in input?input.error:current.error;
 const time=now();
 db.prepare(`
  UPDATE validation_repair_attempts
  SET status=?,
      repair_json=?,
      files_json=?,
      error=?,
      updated_at=?,
      completed_at=?
  WHERE id=?
 `).run(
  status,
  repair?JSON.stringify(repair):null,
  JSON.stringify(files),
  error||null,
  time,
  terminal?time:null,
  id
 );
 return getValidationRepairAttempt(id)!;
}

export function deleteValidationRepairAttemptsByRun(runId:string){
 db.prepare("DELETE FROM validation_repair_attempts WHERE run_id=?").run(runId);
}
