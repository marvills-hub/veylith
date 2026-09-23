import {getAIProvider} from "./provider.service.js";
import type {ArchitectureResult,DevelopmentPlan,DevelopmentResult} from "../orchestration/pipeline.types.js";

export async function developProject(task:any,project:any,architecture:ArchitectureResult,plan:DevelopmentPlan):Promise<DevelopmentResult>{
 const provider=getAIProvider();
 const system=`You are Veylith's autonomous software developer.
Implement the supplied software architecture and development plan.
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
- Generate complete files, never snippets.
- Every file path must be relative.
- Implement the actual requested behavior.
- Include all required configuration and test files.
- Do not use shell operators.
- Do not use destructive commands.
- Do not include git commands.
- Validation commands must actually verify the implementation.`;
 return provider.json<DevelopmentResult>(
  system,
  `PROJECT:\n${project.name}\n\nREQUIREMENT:\n${task.prompt}\n\nARCHITECTURE:\n${JSON.stringify(architecture,null,2)}\n\nPLAN:\n${JSON.stringify(plan,null,2)}`,
  task.id,
  project.id
 );
}
