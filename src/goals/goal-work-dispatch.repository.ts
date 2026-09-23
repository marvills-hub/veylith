import {db} from "../database/database.js";
import type {GoalWorkDispatch,GoalWorkDispatchStatus} from "./goal-work-dispatch.types.js";

const now=()=>new Date().toISOString();

export function ensureGoalWorkDispatchSchema(){
 db.exec(`
 CREATE TABLE IF NOT EXISTS goal_work_dispatches(
  work_item_id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL UNIQUE,
  job_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_goal_dispatch_goal ON goal_work_dispatches(goal_id);
 CREATE INDEX IF NOT EXISTS idx_goal_dispatch_project ON goal_work_dispatches(project_id);
 CREATE INDEX IF NOT EXISTS idx_goal_dispatch_status ON goal_work_dispatches(status);
 `);
}

ensureGoalWorkDispatchSchema();

function rowToDispatch(row:any):GoalWorkDispatch{
 return{
  workItemId:String(row.work_item_id),
  goalId:String(row.goal_id),
  projectId:String(row.project_id),
  taskId:String(row.task_id),
  jobId:row.job_id?String(row.job_id):null,
  status:row.status,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at)
 };
}

export function getGoalWorkDispatch(workItemId:string):GoalWorkDispatch|null{
 const row=db.prepare(
  "SELECT * FROM goal_work_dispatches WHERE work_item_id=?"
 ).get(workItemId);
 return row?rowToDispatch(row):null;
}

export function listGoalWorkDispatches(goalId:string):GoalWorkDispatch[]{
 return(db.prepare(
  "SELECT * FROM goal_work_dispatches WHERE goal_id=? ORDER BY created_at,work_item_id"
 ).all(goalId) as any[]).map(rowToDispatch);
}

export function createGoalWorkDispatch(input:{
 workItemId:string;
 goalId:string;
 projectId:string;
 taskId:string;
 jobId?:string|null;
 status?:GoalWorkDispatchStatus;
}):GoalWorkDispatch{
 const existing=getGoalWorkDispatch(input.workItemId);
 if(existing)return existing;
 const time=now();
 db.prepare(`
  INSERT INTO goal_work_dispatches(
   work_item_id,goal_id,project_id,task_id,job_id,status,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?)
 `).run(
  input.workItemId,
  input.goalId,
  input.projectId,
  input.taskId,
  input.jobId??null,
  input.status??"queued",
  time,
  time
 );
 return getGoalWorkDispatch(input.workItemId)!;
}

export function updateGoalWorkDispatch(
 workItemId:string,
 status:GoalWorkDispatchStatus,
 jobId?:string|null
):GoalWorkDispatch{
 const current=getGoalWorkDispatch(workItemId);
 if(!current)throw new Error(`Goal work dispatch not found: ${workItemId}`);
 db.prepare(`
  UPDATE goal_work_dispatches
  SET status=?,job_id=COALESCE(?,job_id),updated_at=?
  WHERE work_item_id=?
 `).run(status,jobId??null,now(),workItemId);
 return getGoalWorkDispatch(workItemId)!;
}

export function deleteGoalWorkDispatches(goalId:string){
 return Number(
  db.prepare("DELETE FROM goal_work_dispatches WHERE goal_id=?").run(goalId).changes
 );
}
