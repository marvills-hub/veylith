import {rankRepositoryFiles} from "./context-query.service.js";
import {classifyChangeIntent,classifyChangeRisk} from "./change-classifier.service.js";
import {repositoryMode} from "./change.types.js";
import type {ChangeAnalysis} from "./change.types.js";
import type {RepositoryProfile} from "./repository.types.js";

export function analyzeChange(profile:RepositoryProfile,requirement:string):ChangeAnalysis{
 const mode=repositoryMode(profile);
 const intent=classifyChangeIntent(requirement);
 const ranked=rankRepositoryFiles(profile,requirement);
 const relevant=ranked.filter(item=>item.score>=16).slice(0,20);
 const likelyTargets=relevant.map(item=>({
  path:item.path,
  score:item.score,
  reasons:item.reasons,
  exists:true
 }));
 const risk=classifyChangeRisk(mode,intent,likelyTargets.length);
 const preservationRules=mode==="existing"?[
  "Preserve existing behavior unrelated to the requested change.",
  "Prefer modifying existing files over replacing the project structure.",
  "Do not delete unrelated source, configuration, tests or documentation.",
  "Do not replace package manifests unless dependency or script changes are required.",
  "Preserve existing framework and architectural conventions.",
  "Keep the change set as small as reasonably possible."
 ]:[
  "Create only files required for a complete runnable implementation.",
  "Avoid unnecessary infrastructure and dependencies."
 ];
 const warnings:string[]=[];
 if(mode==="existing"&&likelyTargets.length===0)warnings.push("No strong existing file target was detected; inspect repository context before creating new files.");
 if(risk==="high")warnings.push("Broad change detected; justify every changed file and avoid unrelated rewrites.");
 return{
  repositoryMode:mode,
  intent,
  risk,
  requirement,
  existingFiles:profile.totalFiles,
  likelyTargets,
  preservationRules,
  warnings
 };
}
export function changeAnalysisPrompt(analysis:ChangeAnalysis){
 const targets=analysis.likelyTargets.length
  ?analysis.likelyTargets.map(item=>`- ${item.path} (${item.score}: ${item.reasons.join(", ")})`).join("\n")
  :"- No deterministic target identified.";
 return[
  `REPOSITORY MODE: ${analysis.repositoryMode}`,
  `CHANGE INTENT: ${analysis.intent}`,
  `CHANGE RISK: ${analysis.risk}`,
  "",
  "LIKELY EXISTING TARGETS:",
  targets,
  "",
  "PRESERVATION RULES:",
  ...analysis.preservationRules.map(rule=>`- ${rule}`),
  ...(analysis.warnings.length?["","WARNINGS:",...analysis.warnings.map(item=>`- ${item}`)]:[])
 ].join("\n");
}
