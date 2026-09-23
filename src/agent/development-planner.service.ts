import {getAIProvider} from "./provider.service.js";
import {changeAwareContext} from "../intelligence/change-context.service.js";
import type {ArchitectureResult,DevelopmentPlan} from "../orchestration/pipeline.types.js";

export async function createDevelopmentPlan(task:any,project:any,architecture:ArchitectureResult):Promise<DevelopmentPlan>{
 const provider=getAIProvider();
 const intelligence=await changeAwareContext(
  project.workspace,
  `${task.prompt} ${architecture.summary} ${architecture.structure.join(" ")}`,
  30000
 );
 const system=`You are Veylith's senior development planner.
Convert an approved architecture into a concrete, minimal implementation plan against the ACTUAL repository.
Return ONLY valid JSON:
{
 "summary":"implementation plan summary",
 "architecture":["important implementation decision"],
 "files":[
  {"path":"relative/file/path","purpose":"what this file implements"}
 ],
 "commands":[
  {"command":"npm|npx|node","args":["argument"],"purpose":"why this command validates the project"}
 ]
}
Rules:
- Respect REPOSITORY MODE, CHANGE INTENT and CHANGE RISK.
- For existing repositories, plan the smallest correct change set.
- Treat LIKELY EXISTING TARGETS as investigation priorities.
- Follow all PRESERVATION RULES.
- Do not recreate unrelated files.
- Do not plan a full rewrite when targeted modifications satisfy the requirement.
- List every file that genuinely needs creation or modification.
- Paths must be relative.
- Commands must not contain shell operators.
- Do not include git commands.
- Commands are exclusively finite automated validation.
- Dependency installation is allowed only when required.
- Prefer existing validation scripts.
- Never include npm start, npm run start, npm run dev, watch mode, servers or interactive commands.
- Every validation command must terminate automatically.
- Do not generate source code yet.`;
 return provider.json<DevelopmentPlan>(
  system,
  `PROJECT:
${project.name}

REQUIREMENT:
${task.prompt}

ARCHITECTURE:
${JSON.stringify(architecture,null,2)}

${intelligence.prompt}`,
  task.id,
  project.id
 );
}
