import crypto from"node:crypto";
import{db}from"../database/database.js";
import type{
 ValidationResult,
 ValidationResultStatus,
 ValidationRun,
 ValidationRunStatus
}from"./validation-evidence.types.js";
import type{
 ValidationStage,
 ValidationStrategy
}from"./validation-strategy.types.js";

db.exec(`
 CREATE TABLE IF NOT EXISTS validation_runs(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  workspace TEXT NOT NULL,
  status TEXT NOT NULL,
  strategy_json TEXT NOT NULL,
  summary TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_validation_runs_project
 ON validation_runs(project_id,created_at DESC);
 CREATE INDEX IF NOT EXISTS idx_validation_runs_task
 ON validation_runs(task_id,created_at DESC);

 CREATE TABLE IF NOT EXISTS validation_results(
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  command TEXT NOT NULL,
  args_json TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  duration_ms INTEGER,
  stdout TEXT NOT NULL,
  stderr TEXT NOT NULL,
  failure_kind TEXT,
  fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id,command_id)
 );
 CREATE INDEX IF NOT EXISTS idx_validation_results_run
 ON validation_results(run_id,created_at ASC);
 CREATE INDEX IF NOT EXISTS idx_validation_results_fingerprint
 ON validation_results(fingerprint);
`);

function id(prefix:string){
 return`${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function now(){
 return new Date().toISOString();
}

function json<T>(value:string,fallback:T):T{
 try{return JSON.parse(value) as T;}catch{return fallback;}
}

function mapRun(row:any):ValidationRun{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  workspace:String(row.workspace),
  status:row.status,
  strategy:json(row.strategy_json,{} as ValidationStrategy),
  summary:row.summary?String(row.summary):null,
  startedAt:String(row.started_at),
  completedAt:row.completed_at?String(row.completed_at):null,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}

function mapResult(row:any):ValidationResult{
 return{
  id:String(row.id),
  runId:String(row.run_id),
  commandId:String(row.command_id),
  stage:row.stage,
  command:String(row.command),
  args:json<string[]>(row.args_json,[]),
  status:row.status,
  exitCode:row.exit_code===null?null:Number(row.exit_code),
  durationMs:row.duration_ms===null?null:Number(row.duration_ms),
  stdout:String(row.stdout??""),
  stderr:String(row.stderr??""),
  failureKind:row.failure_kind??null,
  fingerprint:row.fingerprint??null,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}

export function createValidationRun(input:{
 projectId:string;
 taskId?:string|null;
 workspace:string;
 strategy:ValidationStrategy;
}){
 const time=now();
 const runId=id("val");
 db.prepare(`
  INSERT INTO validation_runs(
   id,project_id,task_id,workspace,status,strategy_json,summary,
   started_at,completed_at,created_at,updated_at
  )VALUES(?,?,?,?,? ,?,NULL,?,NULL,?,?)
 `).run(
  runId,
  input.projectId,
  input.taskId??null,
  input.workspace,
  "running",
  JSON.stringify(input.strategy),
  time,
  time,
  time
 );
 return getValidationRun(runId)!;
}

export function getValidationRun(runId:string){
 const row=db.prepare(`
  SELECT * FROM validation_runs WHERE id=?
 `).get(runId);
 return row?mapRun(row):null;
}

export function listProjectValidationRuns(projectId:string){
 return(db.prepare(`
  SELECT * FROM validation_runs
  WHERE project_id=?
  ORDER BY created_at DESC,id DESC
 `).all(projectId) as any[]).map(mapRun);
}

export function listTaskValidationRuns(taskId:string){
 return(db.prepare(`
  SELECT * FROM validation_runs
  WHERE task_id=?
  ORDER BY created_at DESC,id DESC
 `).all(taskId) as any[]).map(mapRun);
}

export function setValidationRunState(
 runId:string,
 status:ValidationRunStatus,
 summary:string|null=null
){
 const current=getValidationRun(runId);
 if(!current)throw new Error(`Validation run not found: ${runId}`);
 const time=now();
 const terminal=["passed","failed","cancelled"].includes(status);
 db.prepare(`
  UPDATE validation_runs
  SET status=?,
      summary=?,
      completed_at=CASE WHEN ?=1 THEN COALESCE(completed_at,?) ELSE NULL END,
      updated_at=?
  WHERE id=?
 `).run(status,summary,terminal?1:0,time,time,runId);
 return getValidationRun(runId)!;
}

export function recordValidationResult(input:{
 runId:string;
 commandId:string;
 stage:ValidationStage;
 command:string;
 args:string[];
 status:ValidationResultStatus;
 exitCode?:number|null;
 durationMs?:number|null;
 stdout?:string;
 stderr?:string;
 failureKind?:string|null;
 fingerprint?:string|null;
}){
 if(!getValidationRun(input.runId))
  throw new Error(`Validation run not found: ${input.runId}`);
 const time=now();
 const existing=db.prepare(`
  SELECT id FROM validation_results
  WHERE run_id=? AND command_id=?
 `).get(input.runId,input.commandId) as any;
 const resultId=existing?.id?String(existing.id):id("vres");
 db.prepare(`
  INSERT INTO validation_results(
   id,run_id,command_id,stage,command,args_json,status,
   exit_code,duration_ms,stdout,stderr,failure_kind,fingerprint,
   created_at,updated_at
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(run_id,command_id) DO UPDATE SET
   stage=excluded.stage,
   command=excluded.command,
   args_json=excluded.args_json,
   status=excluded.status,
   exit_code=excluded.exit_code,
   duration_ms=excluded.duration_ms,
   stdout=excluded.stdout,
   stderr=excluded.stderr,
   failure_kind=excluded.failure_kind,
   fingerprint=excluded.fingerprint,
   updated_at=excluded.updated_at
 `).run(
  resultId,
  input.runId,
  input.commandId,
  input.stage,
  input.command,
  JSON.stringify(input.args),
  input.status,
  input.exitCode??null,
  input.durationMs??null,
  input.stdout??"",
  input.stderr??"",
  input.failureKind??null,
  input.fingerprint??null,
  time,
  time
 );
 return getValidationResult(resultId)!;
}

export function getValidationResult(resultId:string){
 const row=db.prepare(`
  SELECT * FROM validation_results WHERE id=?
 `).get(resultId);
 return row?mapResult(row):null;
}

export function listValidationResults(runId:string){
 return(db.prepare(`
  SELECT * FROM validation_results
  WHERE run_id=?
  ORDER BY created_at ASC,id ASC
 `).all(runId) as any[]).map(mapResult);
}

export function deleteValidationRun(runId:string){
 db.exec("BEGIN IMMEDIATE");
 try{
  db.prepare("DELETE FROM validation_results WHERE run_id=?").run(runId);
  db.prepare("DELETE FROM validation_runs WHERE id=?").run(runId);
  db.exec("COMMIT");
 }catch(error){
  try{db.exec("ROLLBACK");}catch{}
  throw error;
 }
}
