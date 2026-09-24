import {getProjectGoal} from "../goals/goal.repository.js";
import {loadGoalTaskGraph} from "../goals/goal-task-graph.service.js";
import {
 getAgentAssignment,
 getActiveWorkAssignment
} from "./team-assignment.repository.js";
import {
 createAgentHandoff,
 getAgentHandoff,
 updateDraftAgentHandoff,
 setAgentHandoffStatus,
 bindAgentHandoff,
 listIncomingWorkHandoffs
} from "./handoff.repository.js";
import type {
 AgentHandoffArtifact,
 AgentHandoffEvidence
} from "./handoff.types.js";

function cleanList(values:string[]|undefined){
 return [...new Set((values??[]).map(x=>String(x).trim()).filter(Boolean))];
}

export function createWorkHandoff(input:{
 goalId:string;
 fromAssignmentId:string;
 toWorkItemId:string;
 summary:string;
 decisions?:string[];
 artifacts?:AgentHandoffArtifact[];
 evidence?:AgentHandoffEvidence[];
 risks?:string[];
 recommendations?:string[];
 metadata?:Record<string,unknown>;
}){
 const goal=getProjectGoal(input.goalId);
 if(!goal)throw new Error(`Goal not found: ${input.goalId}`);
 const graph=loadGoalTaskGraph(input.goalId);
 const from=getAgentAssignment(input.fromAssignmentId);
 if(!from)throw new Error(`Source assignment not found: ${input.fromAssignmentId}`);
 if(from.goalId!==input.goalId)throw new Error("Source assignment belongs to another goal.");
 if(from.status!=="working"&&from.status!=="completed"){
  throw new Error("Source assignment must be working or completed.");
 }
 const sourceWork=graph.items.find(x=>x.id===from.workItemId);
 const targetWork=graph.items.find(x=>x.id===input.toWorkItemId);
 if(!sourceWork)throw new Error("Source work item not found.");
 if(!targetWork)throw new Error("Target work item not found.");
 if(!targetWork.dependencies.includes(sourceWork.key)){
  throw new Error(`${sourceWork.key} is not a dependency of ${targetWork.key}.`);
 }
 const summary=String(input.summary||"").trim();
 if(!summary)throw new Error("Handoff summary is required.");
 const targetAssignment=getActiveWorkAssignment(targetWork.id);
 return createAgentHandoff({
  goalId:goal.id,
  projectId:goal.projectId,
  fromAssignmentId:from.id,
  fromWorkItemId:sourceWork.id,
  toAssignmentId:targetAssignment?.id??null,
  toWorkItemId:targetWork.id,
  summary,
  decisions:cleanList(input.decisions),
  artifacts:input.artifacts??[],
  evidence:input.evidence??[],
  risks:cleanList(input.risks),
  recommendations:cleanList(input.recommendations),
  metadata:input.metadata??{}
 });
}

export function deliverWorkHandoff(id:string){
 const handoff=getAgentHandoff(id);
 if(!handoff)throw new Error(`Handoff not found: ${id}`);
 if(handoff.status==="delivered"||handoff.status==="consumed")return handoff;
 if(handoff.status!=="draft")throw new Error(`Handoff ${id} cannot be delivered from ${handoff.status}.`);
 if(!handoff.toWorkItemId)throw new Error("Handoff target work item is required.");
 return setAgentHandoffStatus(id,"delivered");
}

export function bindIncomingHandoffs(workItemId:string,assignmentId:string){
 const assignment=getAgentAssignment(assignmentId);
 if(!assignment)throw new Error(`Assignment not found: ${assignmentId}`);
 if(assignment.workItemId!==workItemId)throw new Error("Assignment does not own target work item.");
 const incoming=listIncomingWorkHandoffs(workItemId);
 return incoming.map(handoff=>{
  if(handoff.toAssignmentId===assignmentId)return handoff;
  if(handoff.status==="consumed")return handoff;
  return bindAgentHandoff(handoff.id,assignmentId,workItemId);
 });
}

export function consumeIncomingHandoffs(workItemId:string,assignmentId:string){
 bindIncomingHandoffs(workItemId,assignmentId);
 return listIncomingWorkHandoffs(workItemId).map(handoff=>{
  if(handoff.toAssignmentId!==assignmentId){
   throw new Error(`Handoff ${handoff.id} belongs to another assignment.`);
  }
  if(handoff.status==="consumed")return handoff;
  return setAgentHandoffStatus(handoff.id,"consumed");
 });
}

export function incomingHandoffContext(workItemId:string){
 const incoming=listIncomingWorkHandoffs(workItemId);
 return incoming.map(handoff=>({
  id:handoff.id,
  fromAssignmentId:handoff.fromAssignmentId,
  summary:handoff.summary,
  decisions:handoff.decisions,
  artifacts:handoff.artifacts,
  evidence:handoff.evidence,
  risks:handoff.risks,
  recommendations:handoff.recommendations,
  metadata:handoff.metadata,
  status:handoff.status
 }));
}

export function reviseDraftWorkHandoff(
 id:string,
 patch:Parameters<typeof updateDraftAgentHandoff>[1]
){
 return updateDraftAgentHandoff(id,patch);
}
