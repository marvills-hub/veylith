import {db} from "../database/database.js";
import {now} from "../config/config.js";
import type {AgentRole} from "./team.types.js";

export const SEMANTIC_WORKER_ROLES:AgentRole[]=[
 "architect",
 "planner",
 "developer",
 "tester",
 "reviewer",
 "documentation",
 "delivery"
];

db.exec(`
CREATE TABLE IF NOT EXISTS semantic_workers(
 id TEXT PRIMARY KEY,
 role TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'idle',
 project_id TEXT,
 goal_id TEXT,
 work_item_id TEXT,
 assignment_id TEXT,
 task_id TEXT,
 provider_profile TEXT,
 model_profile TEXT,
 blocked_reason TEXT,
 last_project_id TEXT,
 started_at TEXT,
 heartbeat_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_semantic_workers_status
 ON semantic_workers(status,updated_at);
CREATE INDEX IF NOT EXISTS idx_semantic_workers_project
 ON semantic_workers(project_id,status);
`);

export type SemanticWorkerStatus="idle"|"assigned"|"working"|"waiting"|"blocked";

export type SemanticWorker={
 id:string;
 role:AgentRole;
 status:SemanticWorkerStatus;
 projectId:string|null;
 goalId:string|null;
 workItemId:string|null;
 assignmentId:string|null;
 taskId:string|null;
 providerProfile:string|null;
 modelProfile:string|null;
 blockedReason:string|null;
 lastProjectId:string|null;
 startedAt:string|null;
 heartbeatAt:string;
 updatedAt:string;
};

function map(row:any):SemanticWorker{
 return{
  id:String(row.id),
  role:row.role,
  status:row.status,
  projectId:row.project_id?String(row.project_id):null,
  goalId:row.goal_id?String(row.goal_id):null,
  workItemId:row.work_item_id?String(row.work_item_id):null,
  assignmentId:row.assignment_id?String(row.assignment_id):null,
  taskId:row.task_id?String(row.task_id):null,
  providerProfile:row.provider_profile?String(row.provider_profile):null,
  modelProfile:row.model_profile?String(row.model_profile):null,
  blockedReason:row.blocked_reason?String(row.blocked_reason):null,
  lastProjectId:row.last_project_id?String(row.last_project_id):null,
  startedAt:row.started_at?String(row.started_at):null,
  heartbeatAt:String(row.heartbeat_at),
  updatedAt:String(row.updated_at)
 };
}

export function semanticWorkerId(role:AgentRole){
 return`worker:${role}`;
}

export function ensureSemanticWorkers(){
 const time=now();
 const insert=db.prepare(`
  INSERT OR IGNORE INTO semantic_workers(
   id,role,status,heartbeat_at,updated_at
  ) VALUES(?,?,'idle',?,?)
 `);
 for(const role of SEMANTIC_WORKER_ROLES){
  insert.run(semanticWorkerId(role),role,time,time);
 }
 return listSemanticWorkers();
}

export function listSemanticWorkers(){
 return(db.prepare(`
  SELECT * FROM semantic_workers
  ORDER BY CASE role
   WHEN 'architect' THEN 1
   WHEN 'planner' THEN 2
   WHEN 'developer' THEN 3
   WHEN 'tester' THEN 4
   WHEN 'reviewer' THEN 5
   WHEN 'documentation' THEN 6
   WHEN 'delivery' THEN 7
   ELSE 99 END
 `).all() as any[]).map(map);
}

export function getSemanticWorker(role:AgentRole){
 const row=db.prepare("SELECT * FROM semantic_workers WHERE role=?").get(role);
 return row?map(row):null;
}

export function updateSemanticWorker(
 role:AgentRole,
 input:{
  status:SemanticWorkerStatus;
  projectId?:string|null;
  goalId?:string|null;
  workItemId?:string|null;
  assignmentId?:string|null;
  taskId?:string|null;
  blockedReason?:string|null;
 }
){
 ensureSemanticWorkers();
 const current=getSemanticWorker(role);
 if(!current)throw new Error(`Semantic worker not found: ${role}`);
 const time=now();
 const projectId=input.projectId??null;
 const active=input.status==="assigned"||input.status==="working";
 db.prepare(`
  UPDATE semantic_workers
  SET status=?,
      project_id=?,
      goal_id=?,
      work_item_id=?,
      assignment_id=?,
      task_id=?,
      blocked_reason=?,
      last_project_id=COALESCE(?,last_project_id),
      started_at=CASE
       WHEN ?=1 AND (started_at IS NULL OR assignment_id IS NOT ?) THEN ?
       WHEN ?=0 THEN NULL
       ELSE started_at
      END,
      heartbeat_at=?,
      updated_at=?
  WHERE role=?
 `).run(
  input.status,
  projectId,
  input.goalId??null,
  input.workItemId??null,
  input.assignmentId??null,
  input.taskId??null,
  input.blockedReason??null,
  projectId,
  active?1:0,
  input.assignmentId??null,
  time,
  active?1:0,
  time,
  time,
  role
 );
 return getSemanticWorker(role)!;
}

ensureSemanticWorkers();
