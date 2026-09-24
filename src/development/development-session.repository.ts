import crypto from "node:crypto";
import {db} from "../database/database.js";
import {now} from "../config/config.js";
import type {
 DevelopmentSession,
 DevelopmentSessionStatus,
 DevelopmentMilestone,
 DevelopmentMilestoneStatus
} from "./development-session.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS development_sessions(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 goal_id TEXT NOT NULL,
 status TEXT NOT NULL,
 current_milestone_id TEXT,
 progress INTEGER NOT NULL DEFAULT 0,
 recovery_count INTEGER NOT NULL DEFAULT 0,
 last_checkpoint_at TEXT,
 pause_reason TEXT,
 failure TEXT,
 started_at TEXT NOT NULL,
 paused_at TEXT,
 resumed_at TEXT,
 completed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_development_sessions_project
 ON development_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_development_sessions_goal
 ON development_sessions(goal_id);
CREATE INDEX IF NOT EXISTS idx_development_sessions_status
 ON development_sessions(status);

CREATE TABLE IF NOT EXISTS development_milestones(
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 goal_id TEXT NOT NULL,
 milestone_key TEXT NOT NULL,
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 sequence INTEGER NOT NULL,
 status TEXT NOT NULL,
 work_item_ids_json TEXT NOT NULL,
 progress INTEGER NOT NULL DEFAULT 0,
 started_at TEXT,
 completed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(session_id,milestone_key)
);
CREATE INDEX IF NOT EXISTS idx_development_milestones_session
 ON development_milestones(session_id,sequence);
CREATE INDEX IF NOT EXISTS idx_development_milestones_goal
 ON development_milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_development_milestones_status
 ON development_milestones(status);
`);

function parseIds(value:any):string[]{
 try{
  const parsed=JSON.parse(String(value||"[]"));
  return Array.isArray(parsed)?parsed.map(String):[];
 }catch{
  return[];
 }
}

function mapSession(row:any):DevelopmentSession{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  goalId:String(row.goal_id),
  status:row.status,
  currentMilestoneId:row.current_milestone_id?String(row.current_milestone_id):null,
  progress:Number(row.progress||0),
  recoveryCount:Number(row.recovery_count||0),
  lastCheckpointAt:row.last_checkpoint_at?String(row.last_checkpoint_at):null,
  pauseReason:row.pause_reason?String(row.pause_reason):null,
  failure:row.failure?String(row.failure):null,
  startedAt:String(row.started_at),
  pausedAt:row.paused_at?String(row.paused_at):null,
  resumedAt:row.resumed_at?String(row.resumed_at):null,
  completedAt:row.completed_at?String(row.completed_at):null,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}

function mapMilestone(row:any):DevelopmentMilestone{
 return{
  id:String(row.id),
  sessionId:String(row.session_id),
  projectId:String(row.project_id),
  goalId:String(row.goal_id),
  key:String(row.milestone_key),
  title:String(row.title),
  description:String(row.description),
  sequence:Number(row.sequence),
  status:row.status,
  workItemIds:parseIds(row.work_item_ids_json),
  progress:Number(row.progress||0),
  startedAt:row.started_at?String(row.started_at):null,
  completedAt:row.completed_at?String(row.completed_at):null,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}

export function getDevelopmentSession(id:string){
 const row=db.prepare("SELECT * FROM development_sessions WHERE id=?").get(id);
 return row?mapSession(row):null;
}

export function getActiveDevelopmentSession(projectId:string){
 const row=db.prepare(`
  SELECT * FROM development_sessions
  WHERE project_id=? AND status IN ('active','paused')
  ORDER BY created_at DESC,id DESC
  LIMIT 1
 `).get(projectId);
 return row?mapSession(row):null;
}

export function getGoalDevelopmentSession(goalId:string){
 const row=db.prepare(`
  SELECT * FROM development_sessions
  WHERE goal_id=?
  ORDER BY created_at DESC,id DESC
  LIMIT 1
 `).get(goalId);
 return row?mapSession(row):null;
}

export function listProjectDevelopmentSessions(projectId:string){
 return(db.prepare(`
  SELECT * FROM development_sessions
  WHERE project_id=?
  ORDER BY created_at,id
 `).all(projectId) as any[]).map(mapSession);
}

export function createDevelopmentSession(projectId:string,goalId:string){
 const existing=getActiveDevelopmentSession(projectId);
 if(existing){
  if(existing.goalId!==goalId)throw new Error(`Project already has active development session ${existing.id}.`);
  return existing;
 }
 const time=now();
 const id=`ses_${crypto.randomBytes(8).toString("hex")}`;
 db.prepare(`
  INSERT INTO development_sessions(
   id,project_id,goal_id,status,current_milestone_id,progress,
   recovery_count,last_checkpoint_at,pause_reason,failure,
   started_at,paused_at,resumed_at,completed_at,created_at,updated_at
  ) VALUES(?,?,?,'active',NULL,0,0,NULL,NULL,NULL,?,NULL,NULL,NULL,?,?)
 `).run(id,projectId,goalId,time,time,time);
 return getDevelopmentSession(id)!;
}

export function setDevelopmentSessionState(
 id:string,
 status:DevelopmentSessionStatus,
 options:{reason?:string|null;failure?:string|null}={}
){
 const current=getDevelopmentSession(id);
 if(!current)throw new Error(`Development session not found: ${id}`);
 if(["completed","failed","cancelled"].includes(current.status)){
  if(current.status===status)return current;
  throw new Error(`Terminal development session ${id} cannot transition from ${current.status}.`);
 }
 const time=now();
 const paused=status==="paused";
 const terminal=["completed","failed","cancelled"].includes(status);
 db.prepare(`
  UPDATE development_sessions
  SET status=?,
      pause_reason=?,
      failure=?,
      paused_at=?,
      resumed_at=CASE WHEN ?='active' THEN ? ELSE resumed_at END,
      completed_at=CASE WHEN ?=1 THEN ? ELSE NULL END,
      updated_at=?
  WHERE id=?
 `).run(
  status,
  paused?(options.reason??null):null,
  status==="failed"?(options.failure??options.reason??"Development session failed"):null,
  paused?time:null,
  status,
  time,
  terminal?1:0,
  time,
  time,
  id
 );
 return getDevelopmentSession(id)!;
}

export function updateDevelopmentSessionProgress(
 id:string,
 progress:number,
 currentMilestoneId:string|null
){
 const value=Math.max(0,Math.min(100,Math.round(progress)));
 db.prepare(`
  UPDATE development_sessions
  SET progress=?,current_milestone_id=?,last_checkpoint_at=?,updated_at=?
  WHERE id=?
 `).run(value,currentMilestoneId,now(),now(),id);
 return getDevelopmentSession(id);
}

export function incrementDevelopmentSessionRecovery(id:string){
 const time=now();
 db.prepare(`
  UPDATE development_sessions
  SET recovery_count=recovery_count+1,
      resumed_at=?,
      last_checkpoint_at=?,
      updated_at=?
  WHERE id=?
 `).run(time,time,time,id);
 return getDevelopmentSession(id);
}

export function getDevelopmentMilestone(id:string){
 const row=db.prepare("SELECT * FROM development_milestones WHERE id=?").get(id);
 return row?mapMilestone(row):null;
}

export function listDevelopmentMilestones(sessionId:string){
 return(db.prepare(`
  SELECT * FROM development_milestones
  WHERE session_id=?
  ORDER BY sequence,id
 `).all(sessionId) as any[]).map(mapMilestone);
}

export function createDevelopmentMilestone(input:{
 sessionId:string;
 projectId:string;
 goalId:string;
 key:string;
 title:string;
 description:string;
 sequence:number;
 workItemIds:string[];
}){
 const existing=db.prepare(`
  SELECT * FROM development_milestones
  WHERE session_id=? AND milestone_key=?
  LIMIT 1
 `).get(input.sessionId,input.key);
 if(existing)return mapMilestone(existing);
 const time=now();
 const id=`mil_${crypto.randomBytes(8).toString("hex")}`;
 db.prepare(`
  INSERT INTO development_milestones(
   id,session_id,project_id,goal_id,milestone_key,title,description,
   sequence,status,work_item_ids_json,progress,started_at,completed_at,
   created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,'pending',?,0,NULL,NULL,?,?)
 `).run(
  id,input.sessionId,input.projectId,input.goalId,input.key,
  input.title,input.description,input.sequence,
  JSON.stringify([...new Set(input.workItemIds)]),time,time
 );
 return getDevelopmentMilestone(id)!;
}

export function updateDevelopmentMilestone(
 id:string,
 status:DevelopmentMilestoneStatus,
 progress:number
){
 const current=getDevelopmentMilestone(id);
 if(!current)throw new Error(`Development milestone not found: ${id}`);
 const value=Math.max(0,Math.min(100,Math.round(progress)));
 const time=now();
 const terminal=["completed","failed","cancelled"].includes(status);
 db.prepare(`
  UPDATE development_milestones
  SET status=?,
      progress=?,
      started_at=CASE
       WHEN ?='active' THEN COALESCE(started_at,?)
       ELSE started_at
      END,
      completed_at=CASE WHEN ?=1 THEN COALESCE(completed_at,?) ELSE NULL END,
      updated_at=?
  WHERE id=?
 `).run(status,value,status,time,terminal?1:0,time,time,id);
 return getDevelopmentMilestone(id)!;
}

export function deleteDevelopmentSession(id:string){
 db.exec("BEGIN IMMEDIATE");
 try{
  db.prepare("DELETE FROM development_milestones WHERE session_id=?").run(id);
  const changes=Number(db.prepare("DELETE FROM development_sessions WHERE id=?").run(id).changes);
  db.exec("COMMIT");
  return changes>0;
 }catch(error){
  try{db.exec("ROLLBACK")}catch{}
  throw error;
 }
}
