import {DatabaseSync} from "node:sqlite";
import {mkdir} from "node:fs/promises";
import path from "node:path";
import {DB_PATH,ROOT,now} from "../config/config.js";
await mkdir(path.dirname(DB_PATH),{recursive:true});
await mkdir(ROOT,{recursive:true});
export const db=new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode=WAL;");
db.exec("PRAGMA busy_timeout=5000;");
db.exec("PRAGMA foreign_keys=ON;");
db.exec(`
CREATE TABLE IF NOT EXISTS projects(
id TEXT PRIMARY KEY,
name TEXT NOT NULL,
slug TEXT NOT NULL UNIQUE,
status TEXT NOT NULL DEFAULT 'queued',
phase TEXT NOT NULL DEFAULT 'queued',
progress INTEGER NOT NULL DEFAULT 0,
workspace TEXT NOT NULL,
summary TEXT,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
completed_at TEXT
);
CREATE TABLE IF NOT EXISTS tasks(
id TEXT PRIMARY KEY,
project_id TEXT NOT NULL,
title TEXT NOT NULL,
prompt TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'queued',
phase TEXT NOT NULL DEFAULT 'queued',
priority INTEGER NOT NULL DEFAULT 0,
attempts INTEGER NOT NULL DEFAULT 0,
repair_attempts INTEGER NOT NULL DEFAULT 0,
max_attempts INTEGER NOT NULL DEFAULT 3,
result TEXT,
error TEXT,
created_at TEXT NOT NULL,
started_at TEXT,
completed_at TEXT,
updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events(
id INTEGER PRIMARY KEY AUTOINCREMENT,
type TEXT NOT NULL,
worker_id TEXT,
project_id TEXT,
task_id TEXT,
level TEXT NOT NULL DEFAULT 'info',
message TEXT NOT NULL,
data TEXT,
created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metrics(
id INTEGER PRIMARY KEY AUTOINCREMENT,
cpu REAL NOT NULL,
memory REAL NOT NULL,
memory_used INTEGER NOT NULL,
memory_total INTEGER NOT NULL,
active_tasks INTEGER NOT NULL,
queued_tasks INTEGER NOT NULL,
completed_tasks INTEGER NOT NULL,
failed_tasks INTEGER NOT NULL,
uptime INTEGER NOT NULL,
created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workers(
id TEXT PRIMARY KEY,
hostname TEXT NOT NULL,
pid INTEGER NOT NULL,
status TEXT NOT NULL,
phase TEXT NOT NULL,
task_id TEXT,
project_id TEXT,
started_at TEXT NOT NULL,
heartbeat_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_memory(
id INTEGER PRIMARY KEY AUTOINCREMENT,
project_id TEXT NOT NULL,
type TEXT NOT NULL,
content TEXT NOT NULL,
created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS executions(
id INTEGER PRIMARY KEY AUTOINCREMENT,
project_id TEXT NOT NULL,
task_id TEXT NOT NULL,
command TEXT NOT NULL,
args TEXT NOT NULL,
exit_code INTEGER,
stdout TEXT,
stderr TEXT,
duration_ms INTEGER,
created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS development_steps(
id TEXT PRIMARY KEY,
task_id TEXT NOT NULL,
project_id TEXT NOT NULL,
phase TEXT NOT NULL,
agent TEXT NOT NULL,
title TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'queued',
sequence INTEGER NOT NULL DEFAULT 0,
input TEXT,
output TEXT,
error TEXT,
started_at TEXT,
completed_at TEXT,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs(
 id TEXT PRIMARY KEY,
 type TEXT NOT NULL DEFAULT 'task',
 task_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued',
 priority INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,
 max_attempts INTEGER NOT NULL DEFAULT 3,
 available_at TEXT NOT NULL,
 claimed_by TEXT,
 claimed_at TEXT,
 lease_expires_at TEXT,
 heartbeat_at TEXT,
 last_error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_dispatch ON jobs(status,available_at,priority,created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_task ON jobs(task_id,created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_lease ON jobs(status,lease_expires_at);
CREATE TABLE IF NOT EXISTS worker_slots(
 id TEXT PRIMARY KEY,
 worker_id TEXT NOT NULL,
 slot INTEGER NOT NULL,
 hostname TEXT NOT NULL,
 pid INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'idle',
 phase TEXT NOT NULL DEFAULT 'waiting',
 job_id TEXT,
 task_id TEXT,
 project_id TEXT,
 started_at TEXT NOT NULL,
 heartbeat_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_worker_slots_worker ON worker_slots(worker_id,slot);
CREATE INDEX IF NOT EXISTS idx_worker_slots_status ON worker_slots(status,heartbeat_at);
CREATE TABLE IF NOT EXISTS git_publication_state(
 project_id TEXT PRIMARY KEY,
 stage TEXT NOT NULL DEFAULT 'none',
 commit_sha TEXT,
 branch TEXT,
 github_owner TEXT,
 github_repo TEXT,
 github_url TEXT,
 remote_url TEXT,
 committed_at TEXT,
 repository_ready_at TEXT,
 pushed_at TEXT,
 verified_at TEXT,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_git_publication_stage ON git_publication_state(stage,updated_at);
CREATE TABLE IF NOT EXISTS provider_circuits(
provider TEXT PRIMARY KEY,
state TEXT NOT NULL DEFAULT 'closed',
consecutive_failures INTEGER NOT NULL DEFAULT 0,
consecutive_successes INTEGER NOT NULL DEFAULT 0,
opened_at INTEGER,
retry_at INTEGER,
cooldown_ms INTEGER NOT NULL DEFAULT 120000,
last_failure_at INTEGER,
last_success_at INTEGER,
last_error TEXT,
updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_circuits_state ON provider_circuits(state,retry_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status,priority,created_at);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id,id);
CREATE INDEX IF NOT EXISTS idx_steps_task ON development_steps(task_id,sequence);
CREATE INDEX IF NOT EXISTS idx_steps_project ON development_steps(project_id,sequence);
`);
function ensureColumn(table:string,column:string,type:string){
 const columns=db.prepare(`PRAGMA table_info(${table})`).all() as any[];
 if(!columns.some(x=>x.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
ensureColumn("projects","phase","TEXT NOT NULL DEFAULT 'queued'");
ensureColumn("projects","summary","TEXT");
ensureColumn("tasks","repair_attempts","INTEGER NOT NULL DEFAULT 0");
ensureColumn("projects","github_owner","TEXT");
ensureColumn("projects","github_repo","TEXT");
ensureColumn("projects","github_url","TEXT");
ensureColumn("projects","github_branch","TEXT");
ensureColumn("projects","github_commit","TEXT");
ensureColumn("projects","github_pushed_at","TEXT");
export function memory(projectId:string,type:string,content:unknown){
 let serialized:string;
 if(typeof content==="string")serialized=content;
 else if(content===undefined)serialized="null";
 else{
  try{
   serialized=JSON.stringify(content)??"null";
  }catch{
   serialized=String(content);
  }
 }
 db.prepare("INSERT INTO project_memory(project_id,type,content,created_at) VALUES(?,?,?,?)").run(projectId,type,serialized,now());
}
export function projectMemory(projectId:string){
 return db.prepare("SELECT type,content,created_at FROM project_memory WHERE project_id=? ORDER BY id DESC LIMIT 30").all(projectId);
}






