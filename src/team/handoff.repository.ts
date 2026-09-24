import crypto from "node:crypto";
import {db} from "../database/database.js";
import {now} from "../config/config.js";
import type {
 AgentHandoff,
 AgentHandoffArtifact,
 AgentHandoffEvidence,
 AgentHandoffStatus
} from "./handoff.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS agent_handoffs(
 id TEXT PRIMARY KEY,
 goal_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 from_assignment_id TEXT NOT NULL,
 to_assignment_id TEXT,
 from_work_item_id TEXT NOT NULL,
 to_work_item_id TEXT,
 status TEXT NOT NULL,
 summary TEXT NOT NULL,
 decisions_json TEXT NOT NULL,
 artifacts_json TEXT NOT NULL,
 evidence_json TEXT NOT NULL,
 risks_json TEXT NOT NULL,
 recommendations_json TEXT NOT NULL,
 metadata_json TEXT NOT NULL,
 delivered_at TEXT,
 consumed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_goal
 ON agent_handoffs(goal_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_project
 ON agent_handoffs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_from_assignment
 ON agent_handoffs(from_assignment_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_to_assignment
 ON agent_handoffs(to_assignment_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_to_work
 ON agent_handoffs(to_work_item_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_status
 ON agent_handoffs(status);
`);

function json<T>(value:any,fallback:T):T{
 try{return JSON.parse(String(value)) as T;}catch{return fallback;}
}

function map(row:any):AgentHandoff{
 return{
  id:String(row.id),
  goalId:String(row.goal_id),
  projectId:String(row.project_id),
  fromAssignmentId:String(row.from_assignment_id),
  toAssignmentId:row.to_assignment_id?String(row.to_assignment_id):null,
  fromWorkItemId:String(row.from_work_item_id),
  toWorkItemId:row.to_work_item_id?String(row.to_work_item_id):null,
  status:row.status,
  summary:String(row.summary),
  decisions:json<string[]>(row.decisions_json,[]),
  artifacts:json<AgentHandoffArtifact[]>(row.artifacts_json,[]),
  evidence:json<AgentHandoffEvidence[]>(row.evidence_json,[]),
  risks:json<string[]>(row.risks_json,[]),
  recommendations:json<string[]>(row.recommendations_json,[]),
  metadata:json<Record<string,unknown>>(row.metadata_json,{}),
  deliveredAt:row.delivered_at?String(row.delivered_at):null,
  consumedAt:row.consumed_at?String(row.consumed_at):null,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}

export function getAgentHandoff(id:string){
 const row=db.prepare("SELECT * FROM agent_handoffs WHERE id=?").get(id);
 return row?map(row):null;
}

export function listGoalHandoffs(goalId:string){
 return(db.prepare(`
  SELECT * FROM agent_handoffs
  WHERE goal_id=?
  ORDER BY created_at,id
 `).all(goalId) as any[]).map(map);
}

export function listIncomingWorkHandoffs(workItemId:string){
 return(db.prepare(`
  SELECT * FROM agent_handoffs
  WHERE to_work_item_id=?
  AND status IN ('delivered','consumed')
  ORDER BY created_at,id
 `).all(workItemId) as any[]).map(map);
}

export function listAssignmentHandoffs(assignmentId:string){
 return(db.prepare(`
  SELECT * FROM agent_handoffs
  WHERE from_assignment_id=? OR to_assignment_id=?
  ORDER BY created_at,id
 `).all(assignmentId,assignmentId) as any[]).map(map);
}

export function createAgentHandoff(input:{
 goalId:string;
 projectId:string;
 fromAssignmentId:string;
 fromWorkItemId:string;
 toAssignmentId?:string|null;
 toWorkItemId?:string|null;
 summary:string;
 decisions?:string[];
 artifacts?:AgentHandoffArtifact[];
 evidence?:AgentHandoffEvidence[];
 risks?:string[];
 recommendations?:string[];
 metadata?:Record<string,unknown>;
}){
 const time=now();
 const id=`hnd_${crypto.randomBytes(8).toString("hex")}`;
 db.prepare(`
  INSERT INTO agent_handoffs(
   id,goal_id,project_id,from_assignment_id,to_assignment_id,
   from_work_item_id,to_work_item_id,status,summary,
   decisions_json,artifacts_json,evidence_json,risks_json,
   recommendations_json,metadata_json,delivered_at,
   consumed_at,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,NULL,NULL,?,?)
 `).run(
  id,
  input.goalId,
  input.projectId,
  input.fromAssignmentId,
  input.toAssignmentId??null,
  input.fromWorkItemId,
  input.toWorkItemId??null,
  input.summary,
  JSON.stringify(input.decisions??[]),
  JSON.stringify(input.artifacts??[]),
  JSON.stringify(input.evidence??[]),
  JSON.stringify(input.risks??[]),
  JSON.stringify(input.recommendations??[]),
  JSON.stringify(input.metadata??{}),
  time,
  time
 );
 return getAgentHandoff(id)!;
}

export function updateDraftAgentHandoff(
 id:string,
 patch:{
  summary?:string;
  decisions?:string[];
  artifacts?:AgentHandoffArtifact[];
  evidence?:AgentHandoffEvidence[];
  risks?:string[];
  recommendations?:string[];
  metadata?:Record<string,unknown>;
  toAssignmentId?:string|null;
  toWorkItemId?:string|null;
 }
){
 const current=getAgentHandoff(id);
 if(!current)throw new Error(`Handoff not found: ${id}`);
 if(current.status!=="draft")throw new Error(`Only draft handoffs can be edited.`);
 const next={
  summary:patch.summary??current.summary,
  decisions:patch.decisions??current.decisions,
  artifacts:patch.artifacts??current.artifacts,
  evidence:patch.evidence??current.evidence,
  risks:patch.risks??current.risks,
  recommendations:patch.recommendations??current.recommendations,
  metadata:patch.metadata??current.metadata,
  toAssignmentId:patch.toAssignmentId===undefined?current.toAssignmentId:patch.toAssignmentId,
  toWorkItemId:patch.toWorkItemId===undefined?current.toWorkItemId:patch.toWorkItemId
 };
 db.prepare(`
  UPDATE agent_handoffs
  SET summary=?,decisions_json=?,artifacts_json=?,evidence_json=?,
      risks_json=?,recommendations_json=?,metadata_json=?,
      to_assignment_id=?,to_work_item_id=?,updated_at=?
  WHERE id=? AND status='draft'
 `).run(
  next.summary,
  JSON.stringify(next.decisions),
  JSON.stringify(next.artifacts),
  JSON.stringify(next.evidence),
  JSON.stringify(next.risks),
  JSON.stringify(next.recommendations),
  JSON.stringify(next.metadata),
  next.toAssignmentId,
  next.toWorkItemId,
  now(),
  id
 );
 return getAgentHandoff(id)!;
}

export function setAgentHandoffStatus(id:string,status:AgentHandoffStatus){
 const current=getAgentHandoff(id);
 if(!current)throw new Error(`Handoff not found: ${id}`);
 if(current.status==="cancelled"||current.status==="consumed"){
  if(current.status===status)return current;
  throw new Error(`Terminal handoff ${id} cannot transition from ${current.status}.`);
 }
 const time=now();
 let deliveredAt=current.deliveredAt;
 let consumedAt=current.consumedAt;
 if(status==="delivered"&&!deliveredAt)deliveredAt=time;
 if(status==="consumed"){
  if(current.status!=="delivered")throw new Error("Only delivered handoffs can be consumed.");
  deliveredAt=deliveredAt||time;
  consumedAt=time;
 }
 db.prepare(`
  UPDATE agent_handoffs
  SET status=?,delivered_at=?,consumed_at=?,updated_at=?
  WHERE id=?
 `).run(status,deliveredAt,consumedAt,time,id);
 return getAgentHandoff(id)!;
}

export function bindAgentHandoff(id:string,toAssignmentId:string,toWorkItemId:string){
 const current=getAgentHandoff(id);
 if(!current)throw new Error(`Handoff not found: ${id}`);
 if(current.status==="cancelled"||current.status==="consumed"){
  throw new Error(`Terminal handoff ${id} cannot be rebound.`);
 }
 db.prepare(`
  UPDATE agent_handoffs
  SET to_assignment_id=?,to_work_item_id=?,updated_at=?
  WHERE id=?
 `).run(toAssignmentId,toWorkItemId,now(),id);
 return getAgentHandoff(id)!;
}

export function deleteGoalHandoffs(goalId:string){
 return Number(
  db.prepare("DELETE FROM agent_handoffs WHERE goal_id=?").run(goalId).changes
 );
}
