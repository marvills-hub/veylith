import crypto from"node:crypto";
import{db}from"../../database/database.js";
import{now}from"../../config/config.js";
import type{FailureHistoryRecord,FailureResolutionOutcome}from"./failure-history.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS failure_history(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 task_id TEXT,
 fingerprint TEXT NOT NULL,
 failure_kind TEXT NOT NULL,
 summary TEXT NOT NULL,
 root_cause TEXT NOT NULL DEFAULT '',
 relevant_files_json TEXT NOT NULL DEFAULT '[]',
 repair_files_json TEXT NOT NULL DEFAULT '[]',
 strategy_json TEXT NOT NULL DEFAULT '[]',
 repair_attempt_id TEXT,
 verification_id TEXT,
 before_run_id TEXT,
 after_run_id TEXT,
 snapshot_id TEXT,
 evolution_event_id TEXT,
 outcome TEXT NOT NULL,
 evidence_json TEXT NOT NULL DEFAULT '[]',
 occurrences INTEGER NOT NULL DEFAULT 1,
 first_seen_at TEXT NOT NULL,
 last_seen_at TEXT NOT NULL,
 metadata_json TEXT NOT NULL DEFAULT '{}',
 UNIQUE(project_id,fingerprint,outcome)
);
CREATE INDEX IF NOT EXISTS idx_failure_history_project
ON failure_history(project_id,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_failure_history_fingerprint
ON failure_history(project_id,fingerprint,last_seen_at DESC);
`);

function array(value:any):string[]{
 if(!value)return[];
 try{
  const parsed=JSON.parse(String(value));
  return Array.isArray(parsed)?parsed.map(String):[];
 }catch{return[];}
}
function object(value:any):Record<string,unknown>{
 if(!value)return{};
 try{
  const parsed=JSON.parse(String(value));
  return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};
 }catch{return{};}
}
function map(row:any):FailureHistoryRecord{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  taskId:row.task_id?String(row.task_id):null,
  fingerprint:String(row.fingerprint),
  failureKind:String(row.failure_kind),
  summary:String(row.summary),
  rootCause:String(row.root_cause||""),
  relevantFiles:array(row.relevant_files_json),
  repairFiles:array(row.repair_files_json),
  strategy:array(row.strategy_json),
  repairAttemptId:row.repair_attempt_id?String(row.repair_attempt_id):null,
  verificationId:row.verification_id?String(row.verification_id):null,
  beforeRunId:row.before_run_id?String(row.before_run_id):null,
  afterRunId:row.after_run_id?String(row.after_run_id):null,
  snapshotId:row.snapshot_id?String(row.snapshot_id):null,
  evolutionEventId:row.evolution_event_id?String(row.evolution_event_id):null,
  outcome:String(row.outcome) as FailureResolutionOutcome,
  evidence:array(row.evidence_json),
  occurrences:Number(row.occurrences||1),
  firstSeenAt:String(row.first_seen_at),
  lastSeenAt:String(row.last_seen_at),
  metadata:object(row.metadata_json)
 };
}
export function getFailureHistory(id:string){
 const row=db.prepare("SELECT * FROM failure_history WHERE id=?").get(id) as any;
 return row?map(row):null;
}
export function findFailureHistory(projectId:string,fingerprint:string,outcome?:FailureResolutionOutcome){
 const row=outcome
  ?db.prepare(`SELECT * FROM failure_history WHERE project_id=? AND fingerprint=? AND outcome=? ORDER BY last_seen_at DESC LIMIT 1`).get(projectId,fingerprint,outcome)
  :db.prepare(`SELECT * FROM failure_history WHERE project_id=? AND fingerprint=? ORDER BY last_seen_at DESC LIMIT 1`).get(projectId,fingerprint) as any;
 return row?map(row):null;
}
export function listFailureHistory(projectId:string,limit=100){
 return(db.prepare(`
  SELECT * FROM failure_history
  WHERE project_id=?
  ORDER BY last_seen_at DESC
  LIMIT ?
 `).all(projectId,limit) as any[]).map(map);
}
export function upsertFailureHistory(input:{
 projectId:string;
 taskId?:string|null;
 fingerprint:string;
 failureKind:string;
 summary:string;
 rootCause?:string;
 relevantFiles?:string[];
 repairFiles?:string[];
 strategy?:string[];
 repairAttemptId?:string|null;
 verificationId?:string|null;
 beforeRunId?:string|null;
 afterRunId?:string|null;
 snapshotId?:string|null;
 evolutionEventId?:string|null;
 outcome:FailureResolutionOutcome;
 evidence?:string[];
 metadata?:Record<string,unknown>;
}){
 const existing=findFailureHistory(input.projectId,input.fingerprint,input.outcome);
 const time=now();
 if(existing){
  db.prepare(`
   UPDATE failure_history SET
    task_id=?,failure_kind=?,summary=?,root_cause=?,
    relevant_files_json=?,repair_files_json=?,strategy_json=?,
    repair_attempt_id=?,verification_id=?,before_run_id=?,after_run_id=?,
    snapshot_id=?,evolution_event_id=?,evidence_json=?,
    occurrences=occurrences+1,last_seen_at=?,metadata_json=?
   WHERE id=?
  `).run(
   input.taskId||existing.taskId,
   input.failureKind,input.summary,input.rootCause||"",
   JSON.stringify([...new Set(input.relevantFiles||[])].sort()),
   JSON.stringify([...new Set(input.repairFiles||[])].sort()),
   JSON.stringify(input.strategy||[]),
   input.repairAttemptId||null,input.verificationId||null,
   input.beforeRunId||null,input.afterRunId||null,
   input.snapshotId||null,input.evolutionEventId||null,
   JSON.stringify(input.evidence||[]),time,
   JSON.stringify(input.metadata||{}),existing.id
  );
  return getFailureHistory(existing.id)!;
 }
 const id=`fhi_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;
 db.prepare(`
  INSERT INTO failure_history(
   id,project_id,task_id,fingerprint,failure_kind,summary,root_cause,
   relevant_files_json,repair_files_json,strategy_json,repair_attempt_id,
   verification_id,before_run_id,after_run_id,snapshot_id,evolution_event_id,
   outcome,evidence_json,occurrences,first_seen_at,last_seen_at,metadata_json
  )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)
 `).run(
  id,input.projectId,input.taskId||null,input.fingerprint,input.failureKind,
  input.summary,input.rootCause||"",
  JSON.stringify([...new Set(input.relevantFiles||[])].sort()),
  JSON.stringify([...new Set(input.repairFiles||[])].sort()),
  JSON.stringify(input.strategy||[]),
  input.repairAttemptId||null,input.verificationId||null,
  input.beforeRunId||null,input.afterRunId||null,
  input.snapshotId||null,input.evolutionEventId||null,input.outcome,
  JSON.stringify(input.evidence||[]),time,time,JSON.stringify(input.metadata||{})
 );
 return getFailureHistory(id)!;
}
export function deleteFailureHistoryByProject(projectId:string){
 db.prepare("DELETE FROM failure_history WHERE project_id=?").run(projectId);
}
