import {readFile} from "node:fs/promises";
import path from "node:path";
import {contextBudget,fitContent} from "./context-budget.service.js";
import {rankRepositoryFiles} from "./context-query.service.js";
import type {RepositoryContext,RepositoryProfile} from "./repository.types.js";

function frameworkSummary(profile:RepositoryProfile){
 return profile.frameworks.length?profile.frameworks.map(item=>`${item.name}:${item.confidence}`).join(", "):"none detected";
}
export async function buildRepositoryContext(profile:RepositoryProfile,query:string,requestedBudget?:number):Promise<RepositoryContext>{
 const budget=contextBudget(requestedBudget);
 const ranked=rankRepositoryFiles(profile,query);
 const selected=[];
 let used=0;
 for(const candidate of ranked){
  if(used>=budget)break;
  if(candidate.score<=0&&selected.length>=8)break;
  const file=profile.files.find(item=>item.path===candidate.path);
  if(!file?.readable)continue;
  try{
   const raw=await readFile(path.resolve(profile.workspace,file.path),"utf8");
   if(raw.includes("\u0000"))continue;
   const fitted=fitContent(raw,budget-used);
   if(!fitted.includedChars)break;
   selected.push({
    path:file.path,
    score:candidate.score,
    reasons:candidate.reasons,
    content:fitted.content,
    originalBytes:file.size,
    includedChars:fitted.includedChars,
    truncated:fitted.truncated
   });
   used+=fitted.includedChars;
  }catch{}
 }
 const summary=[
  `Repository files: ${profile.totalFiles}`,
  `Frameworks: ${frameworkSummary(profile)}`,
  `Languages: ${Object.entries(profile.languages).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,count])=>`${name}=${count}`).join(", ")||"unknown"}`,
  `Selected context: ${selected.length} files / ${used} chars`
 ].join("\n");
 return{
  query,
  generatedAt:new Date().toISOString(),
  budget,
  used,
  selectedFiles:selected.length,
  files:selected,
  excluded:Math.max(0,profile.files.length-selected.length),
  summary
 };
}
export function repositoryContextPrompt(context:RepositoryContext){
 const files=context.files.map(file=>[
  `FILE: ${file.path}`,
  `RELEVANCE: ${file.score}`,
  file.reasons.length?`REASONS: ${file.reasons.join(", ")}`:"",
  file.content
 ].filter(Boolean).join("\n")).join("\n\n");
 return`${context.summary}\n\n${files}`.trim();
}
