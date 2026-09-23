import {getAIProvider} from "./provider.service.js";
import {sourceSnapshot} from "../runtime/filesystem.service.js";
import type {ArchitectureResult,DevelopmentPlan,DevelopmentResult,ReviewResult} from "../orchestration/pipeline.types.js";

export async function repairProject(task:any,project:any,architecture:ArchitectureResult,plan:DevelopmentPlan,failure:any,review?:ReviewResult):Promise<DevelopmentResult>{
 const provider=getAIProvider();
 const source=await sourceSnapshot(project.workspace);
 const system=`You are Veylith's autonomous repair engineer.
Repair a project using its actual source, validation failure and reviewer findings.
Return ONLY valid JSON:
{
 "summary":"repair summary",
 "files":[
  {"path":"relative/file/path","content":"COMPLETE REPLACEMENT FILE CONTENT"}
 ],
 "commands":[
  {"command":"npm|npx|node","args":["argument"],"purpose":"validation purpose"}
 ]
}
Rules:
- Identify and repair the actual failure.
- Return complete contents for every changed file.
- Change only files needed for the repair.
- Do not use shell operators.
- Do not use destructive commands.
- Do not include git commands.
- Include commands that verify the repair.`;
 return provider.json<DevelopmentResult>(
  system,
  `REQUIREMENT:\n${task.prompt}\n\nARCHITECTURE:\n${JSON.stringify(architecture,null,2)}\n\nPLAN:\n${JSON.stringify(plan,null,2)}\n\nFAILURE:\n${JSON.stringify(failure,null,2)}\n\nREVIEW:\n${JSON.stringify(review||null,null,2)}\n\nCURRENT SOURCE:\n${source}`,
  task.id,
  project.id
 );
}
