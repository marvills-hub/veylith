import {getProjectGoal} from "../goals/goal.repository.js";
import {loadGoalTaskGraph} from "../goals/goal-task-graph.service.js";
import {
 getActiveWorkAssignment,
 createAgentAssignment,
 listGoalAssignments,
 setAgentAssignmentStatus
} from "./team-assignment.repository.js";
import {roleForWorkKind} from "./team-role.service.js";

export function assignGoalWork(workItemId:string,goalId:string){
 const existing=getActiveWorkAssignment(workItemId);
 if(existing)return existing;
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const graph=loadGoalTaskGraph(goalId);
 const work=graph.items.find(item=>item.id===workItemId);
 if(!work)throw new Error(`Goal work item not found: ${workItemId}`);
 if(work.status!=="ready"&&work.status!=="running"){
  throw new Error(`Work item ${work.key} is not assignable while ${work.status}.`);
 }
 return createAgentAssignment({
  goalId,
  projectId:goal.projectId,
  workItemId:work.id,
  role:roleForWorkKind(work.kind)
 });
}

export function assignRunnableGoalTeam(goalId:string){
 const graph=loadGoalTaskGraph(goalId);
 const assignments=[];
 for(const work of graph.items){
  if(work.status!=="ready"&&work.status!=="running")continue;
  const existing=getActiveWorkAssignment(work.id);
  assignments.push(existing||assignGoalWork(work.id,goalId));
 }
 return assignments;
}

export function synchronizeGoalTeam(goalId:string){
 const graph=loadGoalTaskGraph(goalId);
 const assignments=listGoalAssignments(goalId);
 for(const assignment of assignments){
  if(
   assignment.status==="completed"||
   assignment.status==="failed"||
   assignment.status==="cancelled"
  )continue;
  const work=graph.items.find(item=>item.id===assignment.workItemId);
  if(!work)continue;
  if(work.status==="completed"){
   setAgentAssignmentStatus(assignment.id,"completed",assignment.ownerToken);
  }else if(work.status==="failed"){
   setAgentAssignmentStatus(assignment.id,"failed",assignment.ownerToken);
  }else if(work.status==="cancelled"||work.status==="blocked"){
   setAgentAssignmentStatus(assignment.id,"cancelled",assignment.ownerToken);
  }
 }
 return listGoalAssignments(goalId);
}
