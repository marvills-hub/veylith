import crypto from "node:crypto";
import {db} from "../database/database.js";
import type {GoalWorkItem,GoalWorkStatus} from "./goal-task-graph.types.js";

const now=()=>new Date().toISOString();
const id=()=>`wrk_${crypto.randomBytes(8).toString("hex")}`;
const parse=(value:any):string[]=>{
 try{
  const result=JSON.parse(String(value||"[]"));
  return Array.isArray(result)?result.map(String):[];
 }catch{return[];}
};

export function ensureGoalTaskGraphSchema(){
 db.exec(`
 CREATE TABLE IF NOT EXISTS goal_work_items(
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  work_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 50,
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  requirement_ids_json TEXT NOT NULL DEFAULT '[]',
  acceptance_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(goal_id,work_key)
 );
 CREATE INDEX IF NOT EXISTS idx_goal_work_goal ON goal_work_items(goal_id);
 CREATE INDEX IF NOT EXISTS idx_goal_work_project ON goal_work_items(project_id);
 CREATE INDEX IF NOT EXISTS idx_goal_work_status ON goal_work_items(status);
 `);
}

ensureGoalTaskGraphSchema();

function rowToItem(row:any):GoalWorkItem{
 return{
  id:String(row.id),
  goalId:String(row.goal_id),
  projectId:String(row.project_id),
  key:String(row.work_key),
  title:String(row.title),
  description:String(row.description),
  kind:row.kind,
  status:row.status,
  priority:Number(row.priority),
  dependencies:parse(row.dependencies_json),
  requirementIds:parse(row.requirement_ids_json),
  acceptanceCriterionIds:parse(row.acceptance_ids_json),
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  startedAt:row.started_at??undefined,
  completedAt:row.completed_at??undefined
 };
}

export function newGoalWorkItem(
 goalId:string,
 projectId:string,
 input:Omit<GoalWorkItem,"id"|"goalId"|"projectId"|"status"|"createdAt"|"updatedAt">
):GoalWorkItem{
 const time=now();
 return{
  id:id(),
  goalId,
  projectId,
  status:"pending",
  createdAt:time,
  updatedAt:time,
  ...input
 };
}

export function saveGoalTaskGraph(items:GoalWorkItem[]){
 if(!items.length)return;
 const goalId=items[0].goalId;
 const insert=db.prepare(`
  INSERT INTO goal_work_items(
   id,goal_id,project_id,work_key,title,description,kind,status,priority,
   dependencies_json,requirement_ids_json,acceptance_ids_json,
   created_at,updated_at,started_at,completed_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 `);

 db.exec("BEGIN IMMEDIATE");
 try{
  db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId);
  for(const item of items){
   insert.run(
    item.id,
    item.goalId,
    item.projectId,
    item.key,
    item.title,
    item.description,
    item.kind,
    item.status,
    item.priority,
    JSON.stringify(item.dependencies),
    JSON.stringify(item.requirementIds),
    JSON.stringify(item.acceptanceCriterionIds),
    item.createdAt,
    item.updatedAt,
    item.startedAt??null,
    item.completedAt??null
   );
  }
  db.exec("COMMIT");
 }catch(error){
  try{db.exec("ROLLBACK");}catch{}
  throw error;
 }
}

export function listGoalWorkItems(goalId:string):GoalWorkItem[]{
 return(db.prepare(
  "SELECT * FROM goal_work_items WHERE goal_id=? ORDER BY priority DESC,created_at,id"
 ).all(goalId) as any[]).map(rowToItem);
}

export function getGoalWorkItem(id:string):GoalWorkItem|null{
 const row=db.prepare("SELECT * FROM goal_work_items WHERE id=?").get(id);
 return row?rowToItem(row):null;
}

export function updateGoalWorkStatus(id:string,status:GoalWorkStatus):GoalWorkItem{
 const current=getGoalWorkItem(id);
 if(!current)throw new Error(`Goal work item not found: ${id}`);
 const time=now();
 const started=status==="running"?(current.startedAt??time):current.startedAt;
 const completed=status==="completed"?time:current.completedAt;
 db.prepare(`
  UPDATE goal_work_items
  SET status=?,updated_at=?,started_at=?,completed_at=?
  WHERE id=?
 `).run(status,time,started??null,completed??null,id);
 return getGoalWorkItem(id)!;
}

export function deleteGoalTaskGraph(goalId:string){
 return Number(
  db.prepare("DELETE FROM goal_work_items WHERE goal_id=?").run(goalId).changes
 );
}
