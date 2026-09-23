import {getAIProvider} from "./provider.service.js";
import {changeAwareContext} from "../intelligence/change-context.service.js";
import type {ArchitectureResult,DevelopmentPlan,DevelopmentResult} from "../orchestration/pipeline.types.js";

export async function developProject(task:any,project:any,architecture:ArchitectureResult,plan:DevelopmentPlan):Promise<DevelopmentResult>{
 const provider=getAIProvider();
 const planContext=plan.files.map(file=>`${file.path} ${file.purpose}`).join(" ");
 const intelligence=await changeAwareContext(
  project.workspace,
  `${task.prompt} ${architecture.summary} ${planContext}`,
  60000
 );
 const system=`You are Veylith's autonomous software developer.
Implement the supplied architecture and plan against the ACTUAL repository.
Return ONLY valid JSON:
{
 "summary":"implementation summary",
 "files":[
  {"path":"relative/file/path","content":"COMPLETE FILE CONTENT"}
 ],
 "commands":[
  {"command":"npm|npx|node","args":["argument"],"purpose":"validation purpose"}
 ]
}
Rules:
- Respect REPOSITORY MODE, CHANGE INTENT and CHANGE RISK.
- For an existing repository, make the smallest correct change.
- Follow PRESERVATION RULES.
- Treat LIKELY EXISTING TARGETS as investigation priorities, not mandatory edits.
- Do not rewrite unrelated files.
- Do not recreate the project from scratch when modifying an existing repository.
- Modify only files required by the plan and requirement.
- If an unplanned file must change, it must be genuinely necessary for correctness.
- When changing an existing file, return its COMPLETE replacement content.
- Generate complete files, never snippets.
- Every path must be relative.
- Respect existing framework conventions, dependencies, scripts and structure.
- Do not use shell operators.
- Do not use destructive commands.
- Do not include git commands.
- Commands are exclusively finite automated validation.
- Prefer existing finite test, build and lint scripts.
- Never include npm start, npm run start, npm run dev, watch mode, servers or interactive commands.
- Every command must terminate automatically.`;
 return provider.json<DevelopmentResult>(
  system,
  `PROJECT:
${project.name}

REQUIREMENT:
${task.prompt}

ARCHITECTURE:
${JSON.stringify(architecture,null,2)}

PLAN:
${JSON.stringify(plan,null,2)}

${intelligence.prompt}`,
  task.id,
  project.id
 );
}
