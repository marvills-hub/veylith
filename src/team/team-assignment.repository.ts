import crypto from "node:crypto";
import {db} from "../database/database.js";
import {now} from "../config/config.js";
import type {AgentAssignment,AgentAssignmentStatus,AgentRole} from "./team.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS agent_assignments(
 id TEXT PRIMARY KEY,
 goal_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 work_item_id TEXT NOT NULL,
 role TEXT NOT NULL,
 status TEXT NOT NULL,
 owner_token TEXT,
 handoff_from_assignment_id TEXT,
 started_at TEXT,
 completed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_goal
 ON agent_assignments(goal_id);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_project
 ON agent_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_work
 ON agent_assignments(work_item_id);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_status
 ON agent_assignments(status);
`);

function map(row:any):AgentAssignment{
 return{
  id:String(row.id),
  goalId:String(row.goal_id),
  projectId:String(row.project_id),
  workItemId:String(row.work_item_id),
  role:row.role,
  status:row.status,
  ownerToken:row.owner_token?String(row.owner_token):null,
  handoffFromAssignmentId:row.handoff_from_assignment_id?String(row.handoff_from_assignment_id):null,
  startedAt:row.started_at?String(row.started_at):null,
  completedAt:row.completed_at?String(row.completed_at):null,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}

export function getAgentAssignment(id:string){
 const row=db.prepare("SELECT * FROM agent_assignments WHERE id=?").get(id);
 return row?map(row):null;
}

export function getActiveWorkAssignment(workItemId:string){
 const row=db.prepare(`
  SELECT * FROM agent_assignments
  WHERE work_item_id=?
  AND status IN ('assigned','working')
  ORDER BY created_at DESC,id DESC
  LIMIT 1
 `).get(workItemId);
 return row?map(row):null;
}

export function listGoalAssignments(goalId:string){
 return(db.prepare(`
  SELECT * FROM agent_assignments
  WHERE goal_id=?
  ORDER BY created_at,id
 `).all(goalId) as any[]).map(map);
}

export function listProjectAssignments(projectId:string){
 return(db.prepare(`
  SELECT * FROM agent_assignments
  WHERE project_id=?
  ORDER BY created_at,id
 `).all(projectId) as any[]).map(map);
}

export function createAgentAssignment(input:{
 goalId:string;
 projectId:string;
 workItemId:string;
 role:AgentRole;
 handoffFromAssignmentId?:string|null;
}){
 const existing=getActiveWorkAssignment(input.workItemId);
 if(existing)return existing;
 const time=now();
 const id=`asg_${crypto.randomBytes(8).toString("hex")}`;
 db.prepare(`
  INSERT INTO agent_assignments(
   id,goal_id,project_id,work_item_id,role,status,
   owner_token,handoff_from_assignment_id,started_at,
   completed_at,created_at,updated_at
  ) VALUES(?,?,?,?,?,'assigned',NULL,?,NULL,NULL,?,?)
 `).run(
  id,input.goalId,input.projectId,input.workItemId,input.role,
  input.handoffFromAssignmentId??null,time,time
 );
 return getAgentAssignment(id)!;
}

export function claimAgentAssignment(id:string,ownerToken:string){
 const owner=String(ownerToken||"").trim();
 if(!owner)throw new Error("Assignment owner token is required.");
 const time=now();
 const result=db.prepare(`
  UPDATE agent_assignments
  SET status='working',owner_token=?,
      started_at=COALESCE(started_at,?),updated_at=?
  WHERE id=?
  AND status='assigned'
  AND owner_token IS NULL
 `).run(owner,time,time,id);
 if(Number(result.changes)===0){
  const current=getAgentAssignment(id);
  if(current?.status==="working"&&current.ownerToken===owner)return current;
  throw new Error(`Assignment ${id} is not available for claim.`);
 }
 return getAgentAssignment(id)!;
}

export function setAgentAssignmentStatus(
 id:string,
 status:AgentAssignmentStatus,
 ownerToken?:string|null
){
 const current=getAgentAssignment(id);
 if(!current)throw new Error(`Assignment not found: ${id}`);
 if(
  current.status==="completed"||
  current.status==="failed"||
  current.status==="cancelled"
 ){
  if(current.status===status)return current;
  throw new Error(`Terminal assignment ${id} cannot transition from ${current.status}.`);
 }
 if(
  current.status==="working"&&
  ownerToken&&
  current.ownerToken!==ownerToken
 )throw new Error(`Assignment ${id} is owned by another worker.`);
 const time=now();
 const terminal=status==="completed"||status==="failed"||status==="cancelled";
 db.prepare(`
  UPDATE agent_assignments
  SET status=?,
      completed_at=?,
      updated_at=?
  WHERE id=?
 `).run(status,terminal?time:null,time,id);
 return getAgentAssignment(id)!;
}

export function releaseAgentAssignment(id:string,ownerToken:string){
 const current=getAgentAssignment(id);
 if(!current)throw new Error(`Assignment not found: ${id}`);
 if(current.status!=="working")return current;
 if(current.ownerToken!==ownerToken)throw new Error(`Assignment ${id} is owned by another worker.`);
 db.prepare(`
  UPDATE agent_assignments
  SET status='assigned',owner_token=NULL,updated_at=?
  WHERE id=? AND status='working' AND owner_token=?
 `).run(now(),id,ownerToken);
 return getAgentAssignment(id)!;
}

export function deleteGoalAssignments(goalId:string){
 return Number(
  db.prepare("DELETE FROM agent_assignments WHERE goal_id=?").run(goalId).changes
 );
}
