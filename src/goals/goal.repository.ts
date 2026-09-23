import crypto from "node:crypto";
import {db} from "../database/database.js";
import type {CreateProjectGoalInput,GoalAcceptanceCriterion,GoalConstraint,GoalRequirement,GoalStatus,ProjectGoal} from "./goal.types.js";

const now=()=>new Date().toISOString();
const id=(prefix:string)=>`${prefix}_${crypto.randomBytes(8).toString("hex")}`;
const parse=<T>(value:string|null|undefined,fallback:T):T=>{
 if(!value)return fallback;
 try{return JSON.parse(value) as T;}catch{return fallback;}
};

export function ensureGoalSchema(){
 db.exec(`
 CREATE TABLE IF NOT EXISTS project_goals(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  priority TEXT NOT NULL DEFAULT 'normal',
  requirements_json TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  constraints_json TEXT NOT NULL DEFAULT '[]',
  source_task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  activated_at TEXT,
  completed_at TEXT
 );
 CREATE INDEX IF NOT EXISTS idx_project_goals_project ON project_goals(project_id);
 CREATE INDEX IF NOT EXISTS idx_project_goals_status ON project_goals(status);
 `);
}

ensureGoalSchema();

function rowToGoal(row:any):ProjectGoal{
 return{
  id:String(row.id),
  projectId:String(row.project_id),
  title:String(row.title),
  objective:String(row.objective),
  status:row.status,
  priority:row.priority,
  requirements:parse<GoalRequirement[]>(row.requirements_json,[]),
  acceptanceCriteria:parse<GoalAcceptanceCriterion[]>(row.acceptance_criteria_json,[]),
  constraints:parse<GoalConstraint[]>(row.constraints_json,[]),
  sourceTaskId:row.source_task_id??undefined,
  createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
  activatedAt:row.activated_at??undefined,
  completedAt:row.completed_at??undefined
 };
}

export function createProjectGoal(input:CreateProjectGoalInput):ProjectGoal{
 const created=now();
 const goal:ProjectGoal={
  id:id("gol"),
  projectId:input.projectId,
  title:input.title.trim(),
  objective:input.objective.trim(),
  status:"draft",
  priority:input.priority??"normal",
  requirements:(input.requirements??[]).map(item=>({
   id:id("req"),
   text:item.text.trim(),
   required:item.required!==false,
   status:"pending"
  })),
  acceptanceCriteria:(input.acceptanceCriteria??[]).map(text=>({
   id:id("acc"),
   text:text.trim(),
   status:"pending"
  })),
  constraints:(input.constraints??[]).map(item=>({
   id:id("con"),
   type:item.type,
   text:item.text.trim()
  })),
  sourceTaskId:input.sourceTaskId,
  createdAt:created,
  updatedAt:created
 };
 if(!goal.projectId.trim())throw new Error("Goal projectId is required");
 if(!goal.title)throw new Error("Goal title is required");
 if(!goal.objective)throw new Error("Goal objective is required");
 db.prepare(`
  INSERT INTO project_goals(
   id,project_id,title,objective,status,priority,
   requirements_json,acceptance_criteria_json,constraints_json,
   source_task_id,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  goal.id,goal.projectId,goal.title,goal.objective,goal.status,goal.priority,
  JSON.stringify(goal.requirements),JSON.stringify(goal.acceptanceCriteria),
  JSON.stringify(goal.constraints),goal.sourceTaskId??null,goal.createdAt,goal.updatedAt
 );
 return goal;
}

export function getProjectGoal(goalId:string):ProjectGoal|null{
 const row=db.prepare("SELECT * FROM project_goals WHERE id=?").get(goalId);
 return row?rowToGoal(row):null;
}

export function listProjectGoals(projectId?:string):ProjectGoal[]{
 const rows=projectId
  ?db.prepare("SELECT * FROM project_goals WHERE project_id=? ORDER BY created_at DESC").all(projectId)
  :db.prepare("SELECT * FROM project_goals ORDER BY created_at DESC").all();
 return rows.map(rowToGoal);
}

export function updateGoalStatus(goalId:string,status:GoalStatus):ProjectGoal{
 const current=getProjectGoal(goalId);
 if(!current)throw new Error(`Goal not found: ${goalId}`);
 const updated=now();
 const activated=status==="active"?(current.activatedAt??updated):current.activatedAt;
 const completed=status==="completed"?updated:status==="cancelled"?current.completedAt:undefined;
 db.prepare(`
  UPDATE project_goals
  SET status=?,updated_at=?,activated_at=?,completed_at=?
  WHERE id=?
 `).run(status,updated,activated??null,completed??null,goalId);
 return getProjectGoal(goalId)!;
}

export function replaceGoalDefinition(
 goalId:string,
 definition:Pick<ProjectGoal,"requirements"|"acceptanceCriteria"|"constraints">
):ProjectGoal{
 if(!getProjectGoal(goalId))throw new Error(`Goal not found: ${goalId}`);
 db.prepare(`
  UPDATE project_goals
  SET requirements_json=?,acceptance_criteria_json=?,constraints_json=?,updated_at=?
  WHERE id=?
 `).run(
  JSON.stringify(definition.requirements),
  JSON.stringify(definition.acceptanceCriteria),
  JSON.stringify(definition.constraints),
  now(),
  goalId
 );
 return getProjectGoal(goalId)!;
}

export function deleteProjectGoal(goalId:string):boolean{
 return Number(db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId).changes)>0;
}
