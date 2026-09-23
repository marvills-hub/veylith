import {repositoryIntelligence} from "./repository-intelligence.service.js";
import {createRepairScope,repairScopePrompt} from "./repair-scope.service.js";
import type {DevelopmentPlan} from "../orchestration/pipeline.types.js";
import type {DiagnosticResult,RepairHistoryItem} from "../agent/diagnostic.service.js";

export async function targetedRepairContext(
 workspace:string,
 task:any,
 plan:DevelopmentPlan,
 diagnostic:DiagnosticResult,
 history:RepairHistoryItem[],
 budget=60000
){
 const scope=createRepairScope(task,plan,diagnostic,history);
 const intelligence=await repositoryIntelligence(workspace,scope.query,budget);
 const selected=new Set(intelligence.context.files.map(file=>file.path.toLowerCase()));
 const missingDiagnosed=scope.diagnosedFiles.filter(file=>!selected.has(file.toLowerCase()));
 const prompt=[
  repairScopePrompt(scope),
  "",
  missingDiagnosed.length
   ?`WARNING: Diagnosed files not present in selected repository context:\n${missingDiagnosed.map(file=>`- ${file}`).join("\n")}`
   :"All diagnosed files available to repository context selection.",
  "",
  "TARGETED REPOSITORY CONTEXT:",
  intelligence.prompt
 ].join("\n");
 return{
  scope,
  profile:intelligence.profile,
  context:intelligence.context,
  missingDiagnosed,
  prompt
 };
}
