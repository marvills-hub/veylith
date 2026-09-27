import {db} from "../database/database.js";
import {now} from "../config/config.js";
import {getProjectGoal,updateGoalStatus} from "../goals/goal.repository.js";
import {loadGoalTaskGraph,refreshGoalTaskReadiness} from "../goals/goal-task-graph.service.js";
import {updateGoalWorkStatus} from "../goals/goal-task-graph.repository.js";
import {
 getGoalWorkDispatch,
 listGoalWorkDispatches,
 updateGoalWorkDispatch
} from "../goals/goal-work-dispatch.repository.js";
import {
 synchronizeGoalWorkDispatches,
 dispatchRunnableGoalWork
} from "../goals/goal-work-dispatch.service.js";
import {
 assignRunnableGoalTeam,
 synchronizeGoalTeam
} from "./team-assignment.service.js";
import {
 getActiveWorkAssignment,
 listGoalAssignments,
 setAgentAssignmentStatus
} from "./team-assignment.repository.js";
import {bindIncomingHandoffs} from "./handoff.service.js";
import {ensureTerminalReviewDelivery} from "../orchestration/v1/continuation/terminal-continuation.service.js";

export type GoalExecutionState={
 goalId:string;
 projectId:string;
 total:number;
 pending:number;
 ready:number;
 running:number;
 blocked:number;
 completed:number;
 failed:number;
 cancelled:number;
 terminal:boolean;
 success:boolean;
};

function dispatchByTask(taskId:string){
 return db.prepare(`
  SELECT *
  FROM goal_work_dispatches
  WHERE task_id=?
  LIMIT 1
 `).get(taskId) as any;
}

export function goalExecutionForTask(taskId:string){
 const dispatch=dispatchByTask(taskId);
 if(!dispatch)return null;
 const goal=getProjectGoal(String(dispatch.goal_id));
 if(!goal)return null;
 return{
  goal,
  dispatch,
  workItemId:String(dispatch.work_item_id)
 };
}

export function isGoalManagedTask(taskId:string){
 return Boolean(dispatchByTask(taskId));
}

export function goalExecutionState(goalId:string):GoalExecutionState{
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const graph=loadGoalTaskGraph(goalId);
 const development=graph.items.filter(item=>item.kind!=="review"&&item.kind!=="delivery");
 const latest=(kind:"review"|"delivery")=>graph.items
  .filter(item=>item.kind===kind)
  .sort((a,b)=>a.createdAt.localeCompare(b.createdAt))
  .at(-1);
 const review=latest("review");
 const delivery=latest("delivery");
 const active=[
  ...development,
  ...(review?[review]:[]),
  ...(delivery?[delivery]:[])
 ];
 const count=(status:string)=>active.filter(item=>item.status===status).length;
 const completed=count("completed");
 const failed=count("failed");
 const cancelled=count("cancelled");
 const blocked=count("blocked");
 const terminal=active.length>0&&active.every(item=>
  ["completed","failed","cancelled","blocked"].includes(item.status)
 );
 return{
  goalId,
  projectId:goal.projectId,
  total:active.length,
  pending:count("pending"),
  ready:count("ready"),
  running:count("running"),
  blocked,
  completed,
  failed,
  cancelled,
  terminal,
  success:active.length>0&&completed===active.length
 };
}

function reactivateExpandedGoal(goalId:string){
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const state=goalExecutionState(goalId);
 if(goal.status==="completed"&&!state.success){
  return updateGoalStatus(goalId,"active");
 }
 return goal;
}

function updateProjectProgress(goalId:string){
 const state=goalExecutionState(goalId);
 const progress=state.total
  ?Math.round((state.completed/state.total)*100)
  :0;
 const time=now();
 if(state.success){
  const goal=getProjectGoal(goalId);
  if(goal&&goal.status!=="completed"){
   updateGoalStatus(goalId,"completed");
  }
  db.prepare(`
   UPDATE projects
   SET status='completed',
       phase='completed',
       progress=100,
       completed_at=COALESCE(completed_at,?),
       updated_at=?
   WHERE id=?
  `).run(time,time,state.projectId);
 }else if(state.terminal){
  db.prepare(`
   UPDATE projects
   SET status='failed',
       phase='failed',
       progress=?,
       completed_at=NULL,
       updated_at=?
   WHERE id=?
  `).run(progress,time,state.projectId);
 }else{
  const goal=getProjectGoal(goalId);
  if(goal?.status==="completed"){
   updateGoalStatus(goalId,"active");
  }
  db.prepare(`
   UPDATE projects
   SET status='active',
       phase='autonomous_development',
       progress=?,
       completed_at=NULL,
       updated_at=?
   WHERE id=?
  `).run(progress,time,state.projectId);
 }
 return goalExecutionState(goalId);
}

function activeAssignmentForWork(workItemId:string){
 return getActiveWorkAssignment(workItemId);
}

function latestAssignmentForWork(goalId:string,workItemId:string){
 return listGoalAssignments(goalId)
  .filter(item=>item.workItemId===workItemId)
  .sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||
  null;
}

function completeManagedTask(taskId:string){
 const time=now();
 db.prepare(`
  UPDATE tasks
  SET status='completed',
      phase='completed',
      error=NULL,
      completed_at=COALESCE(completed_at,?),
      updated_at=?
  WHERE id=?
 `).run(time,time,taskId);
}

export function prepareGoalTaskExecution(taskId:string){
 const managed=goalExecutionForTask(taskId);
 if(!managed)return null;
 const {goal,workItemId}=managed;
 const work=loadGoalTaskGraph(goal.id).items.find(item=>item.id===workItemId);
 if(!work)throw new Error(`Goal work item not found: ${workItemId}`);
 if(work.status==="completed"||work.status==="failed"||work.status==="cancelled"){
  return{
   goalId:goal.id,
   workItemId,
   assignment:null,
   alreadyTerminal:true
  };
 }
 if(work.status!=="running")updateGoalWorkStatus(work.id,"running");
 synchronizeGoalTeam(goal.id);
 let assignment=activeAssignmentForWork(work.id);
 if(!assignment){
  assignRunnableGoalTeam(goal.id);
  assignment=activeAssignmentForWork(work.id);
 }
 if(!assignment){
  const historical=latestAssignmentForWork(goal.id,work.id);
  throw new Error(
   historical
    ?`No active team assignment exists for goal work ${work.id}; latest assignment ${historical.id} is ${historical.status}.`
    :`No active team assignment exists for goal work ${work.id}.`
  );
 }
 if(assignment.status==="assigned"){
  setAgentAssignmentStatus(assignment.id,"working");
  assignment=activeAssignmentForWork(work.id);
 }
 if(!assignment||assignment.status!=="working"){
  throw new Error(`Goal work ${work.id} does not have a working team assignment.`);
 }
 bindIncomingHandoffs(work.id,assignment.id);
 updateProjectProgress(goal.id);
 return{
  goalId:goal.id,
  workItemId:work.id,
  assignment,
  alreadyTerminal:false
 };
}

export function completeGoalTaskExecution(taskId:string,assignmentId?:string){
 const managed=goalExecutionForTask(taskId);
 if(!managed)return null;
 const {goal,workItemId}=managed;
 const work=loadGoalTaskGraph(goal.id).items.find(item=>item.id===workItemId);
 if(!work)throw new Error(`Goal work item not found: ${workItemId}`);
 const active=activeAssignmentForWork(work.id);
 if(assignmentId){
  if(!active){
   throw new Error(`Cannot complete goal work ${work.id}: active assignment ${assignmentId} is no longer active.`);
  }
  if(active.id!==assignmentId){
   throw new Error(`Cannot complete goal work ${work.id}: assignment ${assignmentId} does not own the active work.`);
  }
 }
 const assignment=active;
 if(!assignment){
  throw new Error(`Cannot complete goal work ${work.id} without an active team assignment.`);
 }
 if(assignment.status!=="completed"){
  setAgentAssignmentStatus(assignment.id,"completed");
 }
 completeManagedTask(taskId);
 const dispatch=getGoalWorkDispatch(work.id);
 if(dispatch&&dispatch.status!=="completed"){
  updateGoalWorkDispatch(work.id,"completed");
 }
 if(work.status!=="completed"){
  updateGoalWorkStatus(work.id,"completed");
 }
 refreshGoalTaskReadiness(goal.id);
 synchronizeGoalTeam(goal.id);
 const terminalContinuation=ensureTerminalReviewDelivery(goal.id);
 if(terminalContinuation.created){
  refreshGoalTaskReadiness(goal.id);
  synchronizeGoalWorkDispatches(goal.id);
  synchronizeGoalTeam(goal.id);
 }
 const assignments=assignRunnableGoalTeam(goal.id);
 const dispatched=dispatchRunnableGoalWork(goal.id);
 for(const item of assignments){
  try{bindIncomingHandoffs(item.workItemId,item.id);}catch{}
 }
 const state=updateProjectProgress(goal.id);
 return{
  goalId:goal.id,
  workItemId:work.id,
  assignmentId:assignment.id,
  assignments,
  dispatched,
  terminalContinuation,
  state
 };
}

export function failGoalTaskExecution(taskId:string,status:"failed"|"cancelled"="failed",assignmentId?:string){
 const managed=goalExecutionForTask(taskId);
 if(!managed)return null;
 const {goal,workItemId}=managed;
 const work=loadGoalTaskGraph(goal.id).items.find(item=>item.id===workItemId);
 if(!work)throw new Error(`Goal work item not found: ${workItemId}`);
 const assignment=activeAssignmentForWork(work.id);
 if(assignmentId&&assignment&&assignment.id!==assignmentId){
  throw new Error(`Cannot fail goal work ${work.id}: assignment ${assignmentId} does not own the active work.`);
 }
 if(assignment&&!["failed","cancelled","completed"].includes(assignment.status)){
  setAgentAssignmentStatus(
   assignment.id,
   status==="cancelled"?"cancelled":"failed"
  );
 }
 const time=now();
 db.prepare(`
  UPDATE tasks
  SET status=?,
      phase=?,
      completed_at=?,
      updated_at=?
  WHERE id=?
 `).run(status,status,time,time,taskId);
 const dispatch=getGoalWorkDispatch(work.id);
 if(dispatch&&dispatch.status!==status){
  updateGoalWorkDispatch(work.id,status);
 }
 if(work.status!==status)updateGoalWorkStatus(work.id,status);
 refreshGoalTaskReadiness(goal.id);
 synchronizeGoalTeam(goal.id);
 const state=updateProjectProgress(goal.id);
 return{goalId:goal.id,workItemId:work.id,state};
}

export function synchronizeGoalExecution(goalId:string){
 synchronizeGoalWorkDispatches(goalId);
 refreshGoalTaskReadiness(goalId);
 synchronizeGoalTeam(goalId);
 const terminalContinuation=ensureTerminalReviewDelivery(goalId);
 if(terminalContinuation.created){
  refreshGoalTaskReadiness(goalId);
  synchronizeGoalWorkDispatches(goalId);
  synchronizeGoalTeam(goalId);
 }
 reactivateExpandedGoal(goalId);
 const assignments=assignRunnableGoalTeam(goalId);
 const dispatched=dispatchRunnableGoalWork(goalId);
 for(const item of assignments){
  try{bindIncomingHandoffs(item.workItemId,item.id);}catch{}
 }
 const state=updateProjectProgress(goalId);
 return{assignments,dispatched,terminalContinuation,state};
}

export function goalExecutionSnapshot(goalId:string){
 const graph=loadGoalTaskGraph(goalId);
 const dispatches=listGoalWorkDispatches(goalId);
 const assignments=listGoalAssignments(goalId);
 return{
  state:goalExecutionState(goalId),
  graph,
  dispatches,
  assignments
 };
}

