import crypto from "node:crypto";
import {db} from "../database/database.js";
import {now} from "../config/config.js";
import {enqueueTask} from "../jobs/job.service.js";
import {getProjectGoal} from "./goal.repository.js";
import {getGoalWorkItem,updateGoalWorkStatus} from "./goal-task-graph.repository.js";
import {refreshGoalTaskReadiness,runnableGoalWork} from "./goal-task-graph.service.js";
import {
 createGoalWorkDispatch,
 getGoalWorkDispatch,
 listGoalWorkDispatches,
 updateGoalWorkDispatch
} from "./goal-work-dispatch.repository.js";
import type {GoalWorkDispatchStatus} from "./goal-work-dispatch.types.js";

function taskId(){
 return `tsk_${crypto.randomBytes(8).toString("hex")}`;
}

function taskStatusToDispatch(status:string):GoalWorkDispatchStatus{
 if(status==="completed")return"completed";
 if(status==="failed")return"failed";
 if(status==="cancelled")return"cancelled";
 if(status==="running")return"running";
 return"queued";
}

function workPrompt(goal:any,work:any){
 const requirements=goal.requirements
  .filter((item:any)=>work.requirementIds.includes(item.id))
  .map((item:any)=>`- ${item.text}`)
  .join("\n");
 const criteria=goal.acceptanceCriteria
  .filter((item:any)=>work.acceptanceCriterionIds.includes(item.id))
  .map((item:any)=>`- ${item.text}`)
  .join("\n");
 const constraints=goal.constraints
  .map((item:any)=>`- [${item.type}] ${item.text}`)
  .join("\n");
 return[
  `VEYLITH PROJECT GOAL: ${goal.title}`,
  "",
  `GOAL OBJECTIVE:`,
  goal.objective,
  "",
  `CURRENT AUTONOMOUS WORK ITEM:`,
  work.title,
  "",
  `WORK DESCRIPTION:`,
  work.description,
  "",
  `WORK KIND: ${work.kind}`,
  "",
  `REQUIREMENTS COVERED BY THIS WORK:`,
  requirements||"- No directly mapped requirement",
  "",
  `ACCEPTANCE CRITERIA COVERED BY THIS WORK:`,
  criteria||"- No directly mapped acceptance criterion",
  "",
  `PROJECT CONSTRAINTS:`,
  constraints||"- None",
  "",
  `DEPENDENCY KEYS:`,
  work.dependencies.length?work.dependencies.map((item:string)=>`- ${item}`).join("\n"):"- None",
  "",
  "Implement only this bounded work item while preserving the existing repository and completed dependency work."
 ].join("\n");
}

function createTaskForWork(goal:any,work:any){
 const existing=getGoalWorkDispatch(work.id);
 if(existing)return existing;

 const id=taskId();
 const time=now();
 const prompt=workPrompt(goal,work);

 db.prepare(`
  INSERT INTO tasks(
   id,project_id,title,prompt,status,phase,priority,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  id,
  goal.projectId,
  work.title,
  prompt,
  "queued",
  "queued",
  work.priority,
  time,
  time
 );

 const job=enqueueTask(id);

 return createGoalWorkDispatch({
  workItemId:work.id,
  goalId:goal.id,
  projectId:goal.projectId,
  taskId:id,
  jobId:job.id,
  status:"queued"
 });
}

export function dispatchRunnableGoalWork(goalId:string){
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 if(goal.status!=="ready"&&goal.status!=="active"){
  throw new Error(`Goal must be ready or active before dispatch, received ${goal.status}`);
 }

 refreshGoalTaskReadiness(goalId);
 const runnable=runnableGoalWork(goalId);
 const dispatched=[];

 for(const work of runnable){
  const existing=getGoalWorkDispatch(work.id);
  if(existing){
   dispatched.push(existing);
   continue;
  }
  const dispatch=createTaskForWork(goal,work);
  updateGoalWorkStatus(work.id,"running");
  dispatched.push(dispatch);
 }

 return dispatched;
}

export function synchronizeGoalWorkDispatches(goalId:string){
 const dispatches=listGoalWorkDispatches(goalId);

 for(const dispatch of dispatches){
  const task=db.prepare(
   "SELECT * FROM tasks WHERE id=?"
  ).get(dispatch.taskId) as any;

  if(!task)continue;

  const status=taskStatusToDispatch(String(task.status));
  if(dispatch.status!==status){
   updateGoalWorkDispatch(dispatch.workItemId,status);
  }

  const work=getGoalWorkItem(dispatch.workItemId);
  if(!work)continue;

  if(status==="completed"&&work.status!=="completed"){
   updateGoalWorkStatus(work.id,"completed");
  }else if(status==="failed"&&work.status!=="failed"){
   updateGoalWorkStatus(work.id,"failed");
  }else if(status==="cancelled"&&work.status!=="cancelled"){
   updateGoalWorkStatus(work.id,"cancelled");
  }else if(status==="running"&&work.status!=="running"){
   updateGoalWorkStatus(work.id,"running");
  }
 }

 const readiness=refreshGoalTaskReadiness(goalId);

 return{
  dispatches:listGoalWorkDispatches(goalId),
  graph:readiness.graph
 };
}

export function advanceGoalExecution(goalId:string){
 const synchronized=synchronizeGoalWorkDispatches(goalId);
 const dispatched=dispatchRunnableGoalWork(goalId);
 return{
  graph:refreshGoalTaskReadiness(goalId).graph,
  dispatches:listGoalWorkDispatches(goalId),
  newlyDispatched:dispatched,
  previous:synchronized
 };
}
