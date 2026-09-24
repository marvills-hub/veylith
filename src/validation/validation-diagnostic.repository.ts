import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{DiagnosticResult}from"../agent/diagnostic.service.js";
import type{ValidationDiagnostic,ValidationDiagnosticStatus}from"./validation-diagnostic.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS validation_diagnostics(
 id TEXT PRIMARY KEY,
 run_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 task_id TEXT,
 status TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 failure_kind TEXT NOT NULL,
 repeated_count INTEGER NOT NULL DEFAULT 0,
 diagnostic_json TEXT,
 error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_validation_diagnostics_run
ON validation_diagnostics(run_id);
CREATE INDEX IF NOT EXISTS idx_validation_diagnostics_project_fingerprint
ON validation_diagnostics(project_id,fingerprint);
CREATE INDEX IF NOT EXISTS idx_validation_diagnostics_task
ON validation_diagnostics(task_id);
`);

function parse(value:any){
 if(value===null||value===undefined||value==="")return null;
 try{return JSON.parse(String(value));}catch{return null;}
}

function map(row:any):ValidationDiagnostic{
 return{
  id:String(row.id),
  runId:String(row.run_id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  status:String(row.status) as ValidationDiagnosticStatus,
  fingerprint:String(row.fingerprint),
  failureKind:String(row.failure_kind),
  repeatedCount:Number(row.repeated_count||0),
  diagnostic:parse(row.diagnostic_json),
  error:row.error?String(row.error):null,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  completedAt:row.completed_at?String(row.completed_at):null
 };
}

export function getValidationDiagnostic(id:string){
 const row=db.prepare("SELECT * FROM validation_diagnostics WHERE id=?").get(id) as any;
 return row?map(row):null;
}

export function getRunValidationDiagnostic(runId:string){
 const row=db.prepare(`
  SELECT * FROM validation_diagnostics
  WHERE run_id=?
  ORDER BY created_at DESC
  LIMIT 1
 `).get(runId) as any;
 return row?map(row):null;
}

export function listProjectValidationDiagnostics(projectId:string,limit=30){
 return(db.prepare(`
  SELECT * FROM validation_diagnostics
  WHERE project_id=?
  ORDER BY created_at DESC
  LIMIT ?
 `).all(projectId,limit) as any[]).map(map);
}

export function listTaskValidationDiagnostics(taskId:string,limit=30){
 return(db.prepare(`
  SELECT * FROM validation_diagnostics
  WHERE task_id=?
  ORDER BY created_at DESC
  LIMIT ?
 `).all(taskId,limit) as any[]).map(map);
}

export function listFingerprintDiagnostics(projectId:string,fingerprint:string,limit=30){
 return(db.prepare(`
  SELECT * FROM validation_diagnostics
  WHERE project_id=? AND fingerprint=?
  ORDER BY created_at DESC
  LIMIT ?
 `).all(projectId,fingerprint,limit) as any[]).map(map);
}

export function latestCompletedFingerprintDiagnostic(projectId:string,fingerprint:string){
 const row=db.prepare(`
  SELECT * FROM validation_diagnostics
  WHERE project_id=? AND fingerprint=?
    AND status IN('diagnosed','reused')
    AND diagnostic_json IS NOT NULL
  ORDER BY completed_at DESC,updated_at DESC
  LIMIT 1
 `).get(projectId,fingerprint) as any;
 return row?map(row):null;
}

export function createValidationDiagnostic(input:{
 runId:string;
 projectId:string;
 taskId?:string|null;
 fingerprint:string;
 failureKind:string;
 repeatedCount?:number;
 status?:ValidationDiagnosticStatus;
}){
 const existing=getRunValidationDiagnostic(input.runId);
 if(existing)return existing;
 const id=`vdiag_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;
 const time=now();
 db.prepare(`
  INSERT INTO validation_diagnostics(
   id,run_id,project_id,task_id,status,fingerprint,failure_kind,
   repeated_count,diagnostic_json,error,created_at,updated_at,completed_at
  ) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,?,?,NULL)
 `).run(
  id,input.runId,input.projectId,input.taskId||null,input.status||"pending",
  input.fingerprint,input.failureKind,input.repeatedCount||0,time,time
 );
 return getValidationDiagnostic(id)!;
}

export function setValidationDiagnosticState(
 id:string,
 status:ValidationDiagnosticStatus,
 input?:{
  repeatedCount?:number;
  diagnostic?:DiagnosticResult|null;
  error?:string|null;
 }
){
 const current=getValidationDiagnostic(id);
 if(!current)throw new Error(`Validation diagnostic not found: ${id}`);
 const terminal=["diagnosed","reused","blocked"].includes(status);
 const diagnostic=input&&"diagnostic"in input?input.diagnostic:current.diagnostic;
 const error=input&&"error"in input?input.error:current.error;
 const repeatedCount=input?.repeatedCount??current.repeatedCount;
 const time=now();
 db.prepare(`
  UPDATE validation_diagnostics
  SET status=?,
      repeated_count=?,
      diagnostic_json=?,
      error=?,
      updated_at=?,
      completed_at=?
  WHERE id=?
 `).run(
  status,repeatedCount,diagnostic?JSON.stringify(diagnostic):null,error||null,
  time,terminal?time:null,id
 );
 return getValidationDiagnostic(id)!;
}

export function deleteValidationDiagnosticsByRun(runId:string){
 db.prepare("DELETE FROM validation_diagnostics WHERE run_id=?").run(runId);
}
