import{randomBytes}from"node:crypto";
import{db}from"../database/database.js";
import type{DevelopmentCycle,DevelopmentCycleInput,DevelopmentCycleStatus}from"./development-cycle.types.js";

db.exec(`
CREATE TABLE IF NOT EXISTS development_cycles(
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 goal_id TEXT NOT NULL,
 cycle_number INTEGER NOT NULL,
 status TEXT NOT NULL,
 reason TEXT,
 summary TEXT,
 work_item_ids_json TEXT NOT NULL DEFAULT '[]',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 started_at TEXT NOT NULL,
 completed_at TEXT,
 UNIQUE(session_id,cycle_number)
);
CREATE INDEX IF NOT EXISTS idx_development_cycles_session
ON development_cycles(session_id,cycle_number);
CREATE INDEX IF NOT EXISTS idx_development_cycles_goal
ON development_cycles(goal_id,status);
`);

function id(){return`cyc_${randomBytes(8).toString("hex")}`;}
function parse(row:any):DevelopmentCycle{
 return{
  id:String(row.id),
  sessionId:String(row.session_id),
  projectId:String(row.project_id),
  goalId:String(row.goal_id),
  number:Number(row.cycle_number),
  status:row.status as DevelopmentCycleStatus,
  reason:row.reason??null,
  summary:row.summary??null,
  workItemIds:JSON.parse(row.work_item_ids_json||"[]"),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  startedAt:String(row.started_at),
  completedAt:row.completed_at??null
 };
}
export function getDevelopmentCycle(cycleId:string){
 const row=db.prepare("SELECT * FROM development_cycles WHERE id=?").get(cycleId) as any;
 return row?parse(row):null;
}
export function getActiveDevelopmentCycle(sessionId:string){
 const row=db.prepare(`
  SELECT * FROM development_cycles
  WHERE session_id=? AND status IN ('active','evaluating')
  ORDER BY cycle_number DESC LIMIT 1
 `).get(sessionId) as any;
 return row?parse(row):null;
}
export function getLatestDevelopmentCycle(sessionId:string){
 const row=db.prepare(`
  SELECT * FROM development_cycles
  WHERE session_id=?
  ORDER BY cycle_number DESC LIMIT 1
 `).get(sessionId) as any;
 return row?parse(row):null;
}
export function listDevelopmentCycles(sessionId:string){
 return(db.prepare(`
  SELECT * FROM development_cycles
  WHERE session_id=?
  ORDER BY cycle_number ASC
 `).all(sessionId) as any[]).map(parse);
}
export function createDevelopmentCycle(input:DevelopmentCycleInput){
 const existing=getActiveDevelopmentCycle(input.sessionId);
 if(existing)return existing;
 const latest=getLatestDevelopmentCycle(input.sessionId);
 const now=new Date().toISOString();
 const cycleId=id();
 const number=(latest?.number??0)+1;
 db.prepare(`
  INSERT INTO development_cycles(
   id,session_id,project_id,goal_id,cycle_number,status,reason,summary,
   work_item_ids_json,created_at,updated_at,started_at,completed_at
  )VALUES(?,?,?,?,?,'active',?,NULL,?,?,?,?,NULL)
 `).run(
  cycleId,input.sessionId,input.projectId,input.goalId,number,input.reason??null,
  JSON.stringify(input.workItemIds??[]),now,now,now
 );
 return getDevelopmentCycle(cycleId)!;
}
export function setDevelopmentCycleState(
 cycleId:string,
 status:DevelopmentCycleStatus,
 options:{reason?:string|null;summary?:string|null}={}
){
 const cycle=getDevelopmentCycle(cycleId);
 if(!cycle)throw new Error(`Development cycle not found: ${cycleId}`);
 const now=new Date().toISOString();
 const terminal=["continued","completed","failed","cancelled"].includes(status);
 db.prepare(`
  UPDATE development_cycles
  SET status=?,
      reason=COALESCE(?,reason),
      summary=COALESCE(?,summary),
      updated_at=?,
      completed_at=CASE WHEN ? THEN COALESCE(completed_at,?) ELSE completed_at END
  WHERE id=?
 `).run(status,options.reason??null,options.summary??null,now,terminal?1:0,now,cycleId);
 return getDevelopmentCycle(cycleId)!;
}
export function setDevelopmentCycleWork(cycleId:string,workItemIds:string[]){
 const cycle=getDevelopmentCycle(cycleId);
 if(!cycle)throw new Error(`Development cycle not found: ${cycleId}`);
 db.prepare(`
  UPDATE development_cycles
  SET work_item_ids_json=?,updated_at=?
  WHERE id=?
 `).run(JSON.stringify([...new Set(workItemIds)]),new Date().toISOString(),cycleId);
 return getDevelopmentCycle(cycleId)!;
}
export function deleteDevelopmentCycles(sessionId:string){
 return db.prepare("DELETE FROM development_cycles WHERE session_id=?").run(sessionId);
}
