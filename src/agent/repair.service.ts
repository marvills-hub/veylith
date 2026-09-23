import {getAIProvider} from "./provider.service.js";
import {targetedRepairContext} from "../intelligence/targeted-repair-context.service.js";
import {assertRepairScope} from "../intelligence/repair-scope.service.js";
import type {ArchitectureResult,DevelopmentPlan,DevelopmentResult,ReviewResult} from "../orchestration/pipeline.types.js";
import type {DiagnosticResult,RepairHistoryItem} from "./diagnostic.service.js";

export async function repairProject(
 task:any,
 project:any,
 architecture:ArchitectureResult,
 plan:DevelopmentPlan,
 failure:any,
 review?:ReviewResult,
 diagnostic?:DiagnosticResult,
 history:RepairHistoryItem[]=[]
):Promise<DevelopmentResult>{
 if(!diagnostic)throw new Error("Targeted repair requires diagnostic analysis.");
 const provider=getAIProvider();
 const targeted=await targetedRepairContext(
  project.workspace,
  task,
  plan,
  diagnostic,
  history,
  60000
 );
 const historyText=history.length
  ?history.map(item=>[
    `ATTEMPT ${item.attempt}`,
    `SUMMARY: ${item.summary||"(none)"}`,
    `FILES CHANGED: ${item.files.join(", ")||"(none)"}`,
    `RESULT FINGERPRINT: ${item.fingerprint||"(none)"}`,
    `VALIDATION RESULT: ${JSON.stringify(item.validation,null,2)}`
   ].join("\n")).join("\n\n")
  :"No previous completed repairs.";
 const system=`You are Veylith's autonomous targeted repair engineer.
Repair the diagnosed root cause using the supplied TARGETED REPOSITORY CONTEXT.
Return ONLY valid JSON:
{
 "summary":"repair summary including root cause and why these files changed",
 "files":[
  {"path":"relative/file/path","content":"COMPLETE REPLACEMENT FILE CONTENT"}
 ],
 "commands":[
  {"command":"npm|npx|node","args":["argument"],"purpose":"validation purpose"}
 ]
}
Rules:
- DIAGNOSTIC ANALYSIS determines the initial repair scope.
- Follow REPAIR EXPANSION rules.
- Fix the ROOT CAUSE, not merely the visible symptom.
- Prefer DIAGNOSED FILES.
- Study previous repair history before changing anything.
- If the same fingerprint survived a previous repair, do not repeat the same ineffective approach.
- For focused repairs, do not modify unrelated files.
- For expanded repairs, change neighboring files only when concrete evidence requires it.
- Broad investigation is not permission for a project rewrite.
- Preserve all behavior already passing validation.
- Return complete replacement contents for changed files.
- Never delete, weaken or bypass a valid test merely to pass validation.
- Do not remove assertions to conceal failures.
- Do not use shell operators.
- Do not use destructive commands.
- Do not include git commands.
- Validation commands must terminate automatically.
- Prefer a focused reproducing validation first, followed by broader validation where useful.
- Never include npm start, npm run start, npm run dev, watch mode, servers or interactive commands.`;
 const result=await provider.json<DevelopmentResult>(
  system,
  `REQUIREMENT:
${task.prompt}

ARCHITECTURE:
${JSON.stringify(architecture,null,2)}

PLAN:
${JSON.stringify(plan,null,2)}

FAILURE:
${JSON.stringify(failure,null,2)}

DIAGNOSTIC ANALYSIS:
${JSON.stringify(diagnostic,null,2)}

PREVIOUS REPAIR HISTORY:
${historyText}

REVIEW:
${JSON.stringify(review||null,null,2)}

${targeted.prompt}`,
  task.id,
  project.id
 );
 assertRepairScope(targeted.scope,result);
 return result;
}
