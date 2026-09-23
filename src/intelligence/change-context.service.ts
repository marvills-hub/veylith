import {analyzeRepository,repositoryIntelligence} from "./repository-intelligence.service.js";
import {analyzeChange,changeAnalysisPrompt} from "./change-analysis.service.js";
import type {ChangeAnalysis} from "./change.types.js";
import type {RepositoryContext,RepositoryProfile} from "./repository.types.js";

export type ChangeAwareContext={
 profile:RepositoryProfile;
 context:RepositoryContext;
 analysis:ChangeAnalysis;
 repositoryPrompt:string;
 changePrompt:string;
 prompt:string;
};
export async function changeAwareContext(workspace:string,requirement:string,budget?:number):Promise<ChangeAwareContext>{
 const intelligence=await repositoryIntelligence(workspace,requirement,budget);
 const analysis=analyzeChange(intelligence.profile,requirement);
 const changePrompt=changeAnalysisPrompt(analysis);
 return{
  profile:intelligence.profile,
  context:intelligence.context,
  analysis,
  repositoryPrompt:intelligence.prompt,
  changePrompt,
  prompt:`${changePrompt}\n\nREPOSITORY CONTEXT:\n${intelligence.prompt}`
 };
}
export async function currentChangeAnalysis(workspace:string,requirement:string){
 return analyzeChange(await analyzeRepository(workspace),requirement);
}
