import{
 buildSharedProjectContext,
 sharedProjectContextPrompt
}from"../team/shared-context.service.js";
import{
 buildEvolutionAwareContext,
 evolutionAwareContextPrompt
}from"./evolution-aware-context.service.js";
import{releaseHistoryContext}from"../delivery/release-context.service.js";
import type{EvolutionContextRole}from"./evolution-aware-context.types.js";

export async function buildAgentProjectContext(input:{
 goalId:string;
 workItemId:string;
 projectId:string;
 workspace:string;
 role:EvolutionContextRole;
 repositoryBudget?:number;
 memoryLimit?:number;
}){
 const shared=await buildSharedProjectContext({
  goalId:input.goalId,
  workItemId:input.workItemId,
  workspace:input.workspace,
  repositoryBudget:input.repositoryBudget,
  memoryLimit:input.memoryLimit
 });

 const evolution=buildEvolutionAwareContext({
  projectId:input.projectId,
  role:input.role
 });

 const releases=releaseHistoryContext(input.projectId);

 const releasePrompt=releases.prompt?.trim()
  ?releases.prompt.trim()
  :"No verified autonomous release history is available for this project.";

 return{
  shared,
  evolution,
  releases,
  prompt:[
   sharedProjectContextPrompt(shared),
   evolutionAwareContextPrompt(evolution),
   "VERIFIED RELEASE HISTORY:",
   releasePrompt
  ].join("\n\n")
 };
}

export function agentProjectContextPrompt(
 context:{
  prompt:string;
 }
){
 return context.prompt;
}
