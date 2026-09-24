import{db}from"../../database/database.js";
import type{AgentRole}from"../team.types.js";

export type GoalRoleResultStatus="running"|"completed"|"failed";

export interface GoalRoleResult{
 id:string;
 goalId:string;
 projectId:string;
 workItemId:string;
 assignmentId:string;
 taskId:string;
 role:AgentRole;
 status:GoalRoleResultStatus;
 summary:string|null;
 result:any;
 error:string|null;
 startedAt:string;
 completedAt:string|null;
 updatedAt:string;
}

function parseJSON(value:any){
 if(value===null||value===undefined||value==="")return null;
 try{return JSON.parse(String(value));}catch{return null;}
}

function mapResult(row:any):GoalRoleResult{
 return{
  id:String(row.id),
  goalId:String(row.goal_id),
  projectId:String(row.project_id),
  workItemId:String(row.work_item_id),
  assignmentId:String(row.assignment_id),
  taskId:String(row.task_id),
  role:row.role,
  status:row.status,
  summary:row.summary?String(row.summary):null,
  result:parseJSON(row.result_json),
  error:row.error?String(row.error):null,
  startedAt:String(row.started_at),
  completedAt:row.completed_at?String(row.completed_at):null,
  updatedAt:String(row.updated_at)
 };
}

export function listGoalRoleResultRecords(goalId:string){
 return(db.prepare(`
  SELECT *
  FROM goal_role_results
  WHERE goal_id=?
  ORDER BY started_at,id
 `).all(goalId) as any[]).map(mapResult);
}
