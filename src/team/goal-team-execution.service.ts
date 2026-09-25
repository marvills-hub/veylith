import {db} from "../database/database.js";
import {now} from "../config/config.js";
import {getProjectGoal,updateGoalStatus} from "../goals/goal.repository.js";
import {loadGoalTaskGraph,refreshGoalTaskReadiness} from "../goals/goal-task-graph.service.js";
import {updateGoalWorkStatus} from "../goals/goal-task-graph.repository.js";
import {
 getGoalWorkDispatch,
 listGoalWorkDispatches
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
 const count=(status:string)=>graph.items.filter(item=>item.status===status).length;
 const completed=count("completed");
 const failed=count("failed");
 const cancelled=count("cancelled");
 const blocked=count("blocked");
 const terminal=graph.items.length>0&&graph.items.every(item=>
  ["completed","failed","cancelled","blocked"].includes(item.status)
 );
 return{
  goalId,
  projectId:goal.projectId,
  total:graph.items.length,
  pending:count("pending"),
  ready:count("ready"),
  running:count("running"),
  blocked,
  completed,
  failed,
  cancelled,
  terminal,
  success:graph.items.length>0&&completed===graph.items.length
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
       updated_at=?
   WHERE id=?
  `).run(progress,time,state.projectId);
 }else{
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

function assignmentForWork(goalId:string,workItemId:string){
 return getActiveWorkAssignment(workItemId)||
  listGoalAssignments(goalId)
   .filter(item=>item.workItemId===workItemId)
   .sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||
  null;
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
 let assignment=assignmentForWork(goal.id,work.id);
 if(!assignment){
  assignRunnableGoalTeam(goal.id);
  assignment=assignmentForWork(goal.id,work.id);
 }
 if(assignment){
  if(assignment.status==="assigned"){
   setAgentAssignmentStatus(assignment.id,"working");
  }
  bindIncomingHandoffs(work.id,assignment.id);
 }
 updateProjectProgress(goal.id);
 return{
  goalId:goal.id,
  workItemId:work.id,
  assignment,
  alreadyTerminal:false
 };
}

export function completeGoalTaskExecution(taskId:string){
 const managed=goalExecutionForTask(taskId);
 if(!managed)return null;
 const {goal,workItemId}=managed;
 const work=loadGoalTaskGraph(goal.id).items.find(item=>item.id===workItemId);
 if(!work)throw new Error(`Goal work item not found: ${workItemId}`);
 if(work.status!=="completed")updateGoalWorkStatus(work.id,"completed");
 synchronizeGoalWorkDispatches(goal.id);
 synchronizeGoalTeam(goal.id);
 const assignment=assignmentForWork(goal.id,work.id);
 if(assignment&&assignment.status!=="completed"){
  setAgentAssignmentStatus(assignment.id,"completed");
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
  assignments,
  dispatched,
  terminalContinuation,
  state
 };
}

export function failGoalTaskExecution(taskId:string,status:"failed"|"cancelled"="failed"){
 const managed=goalExecutionForTask(taskId);
 if(!managed)return null;
 const {goal,workItemId}=managed;
 const work=loadGoalTaskGraph(goal.id).items.find(item=>item.id===workItemId);
 if(!work)throw new Error(`Goal work item not found: ${workItemId}`);
 if(work.status!==status)updateGoalWorkStatus(work.id,status);
 synchronizeGoalWorkDispatches(goal.id);
 synchronizeGoalTeam(goal.id);
 const assignment=assignmentForWork(goal.id,work.id);
 if(assignment&&!["failed","cancelled","completed"].includes(assignment.status)){
  setAgentAssignmentStatus(
   assignment.id,
   status==="cancelled"?"cancelled":"failed"
  );
 }
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
