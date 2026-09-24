import crypto from"node:crypto";
import{db}from"../database/database.js";
import{now}from"../config/config.js";
import type{
 RepairVerification,
 RepairVerificationStatus
}from"./repair-verification.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS repair_verifications(
 id TEXT PRIMARY KEY,
 repair_attempt_id TEXT NOT NULL UNIQUE,
 project_id TEXT NOT NULL,
 task_id TEXT,
 before_run_id TEXT NOT NULL,
 after_run_id TEXT NOT NULL,
 status TEXT NOT NULL,
 original_fingerprint TEXT NOT NULL,
 original_resolved INTEGER NOT NULL DEFAULT 0,
 regression_free INTEGER NOT NULL DEFAULT 0,
 regressions_json TEXT NOT NULL DEFAULT '[]',
 before_passing_json TEXT NOT NULL DEFAULT '[]',
 after_passing_json TEXT NOT NULL DEFAULT '[]',
 after_failures_json TEXT NOT NULL DEFAULT '[]',
 summary TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_repair_verifications_project
ON repair_verifications(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_verifications_runs
ON repair_verifications(before_run_id,after_run_id);
`);

function parse(value:any){
 if(value===null||value===undefined||value==="")return[];
 try{
  const parsed=JSON.parse(String(value));
  return Array.isArray(parsed)?parsed.map(String):[];
 }catch{
  return[];
 }
}

function map(row:any):RepairVerification{
 return{
  id:String(row.id),
  repairAttemptId:String(row.repair_attempt_id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  beforeRunId:String(row.before_run_id),
  afterRunId:String(row.after_run_id),
  status:String(row.status) as RepairVerificationStatus,
  originalFingerprint:String(row.original_fingerprint),
  originalResolved:Boolean(Number(row.original_resolved)),
  regressionFree:Boolean(Number(row.regression_free)),
  regressions:parse(row.regressions_json),
  beforePassing:parse(row.before_passing_json),
  afterPassing:parse(row.after_passing_json),
  afterFailures:parse(row.after_failures_json),
  summary:row.summary?String(row.summary):null,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  completedAt:row.completed_at?String(row.completed_at):null
 };
}

export function getRepairVerification(id:string){
 const row=db.prepare(`
  SELECT * FROM repair_verifications WHERE id=?
 `).get(id) as any;
 return row?map(row):null;
}

export function getRepairAttemptVerification(repairAttemptId:string){
 const row=db.prepare(`
  SELECT * FROM repair_verifications
  WHERE repair_attempt_id=?
 `).get(repairAttemptId) as any;
 return row?map(row):null;
}

export function listProjectRepairVerifications(projectId:string){
 return(db.prepare(`
  SELECT * FROM repair_verifications
  WHERE project_id=?
  ORDER BY created_at ASC
 `).all(projectId) as any[]).map(map);
}

export function createRepairVerification(input:{
 repairAttemptId:string;
 projectId:string;
 taskId?:string|null;
 beforeRunId:string;
 afterRunId:string;
 originalFingerprint:string;
}){
 const existing=getRepairAttemptVerification(input.repairAttemptId);
 if(existing)return existing;

 const id=`verify_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;
 const time=now();

 db.prepare(`
  INSERT INTO repair_verifications(
   id,repair_attempt_id,project_id,task_id,before_run_id,after_run_id,
   status,original_fingerprint,original_resolved,regression_free,
   regressions_json,before_passing_json,after_passing_json,
   after_failures_json,summary,created_at,updated_at,completed_at
  )VALUES(?,?,?,?,?,?,'pending',?,0,0,'[]','[]','[]','[]',NULL,?,?,NULL)
 `).run(
  id,
  input.repairAttemptId,
  input.projectId,
  input.taskId||null,
  input.beforeRunId,
  input.afterRunId,
  input.originalFingerprint,
  time,
  time
 );

 return getRepairVerification(id)!;
}

export function completeRepairVerification(
 id:string,
 input:{
  status:RepairVerificationStatus;
  originalResolved:boolean;
  regressionFree:boolean;
  regressions:string[];
  beforePassing:string[];
  afterPassing:string[];
  afterFailures:string[];
  summary:string;
 }
){
 const current=getRepairVerification(id);
 if(!current)throw new Error(`Repair verification not found: ${id}`);

 const time=now();

 db.prepare(`
  UPDATE repair_verifications
  SET status=?,
      original_resolved=?,
      regression_free=?,
      regressions_json=?,
      before_passing_json=?,
      after_passing_json=?,
      after_failures_json=?,
      summary=?,
      updated_at=?,
      completed_at=?
  WHERE id=?
 `).run(
  input.status,
  input.originalResolved?1:0,
  input.regressionFree?1:0,
  JSON.stringify(input.regressions),
  JSON.stringify(input.beforePassing),
  JSON.stringify(input.afterPassing),
  JSON.stringify(input.afterFailures),
  input.summary,
  time,
  time,
  id
 );

 return getRepairVerification(id)!;
}

export function deleteRepairVerification(id:string){
 db.prepare("DELETE FROM repair_verifications WHERE id=?").run(id);
}

export function deleteRepairVerificationsByProject(projectId:string){
 db.prepare(`
  DELETE FROM repair_verifications WHERE project_id=?
 `).run(projectId);
}
