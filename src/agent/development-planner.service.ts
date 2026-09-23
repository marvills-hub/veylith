import {getAIProvider} from "./provider.service.js";
import type {ArchitectureResult,DevelopmentPlan} from "../orchestration/pipeline.types.js";

export async function createDevelopmentPlan(task:any,project:any,architecture:ArchitectureResult):Promise<DevelopmentPlan>{
 const provider=getAIProvider();
 const system=`You are Veylith's senior development planner.
Convert an approved architecture into a concrete implementation plan.
Return ONLY valid JSON:
{
 "summary":"implementation plan summary",
 "architecture":["important implementation decision"],
 "files":[
  {"path":"relative/file/path","purpose":"what this file implements"}
 ],
 "commands":[
  {"command":"npm|npx|node","args":["argument"],"purpose":"why this command is needed"}
 ]
}
Rules:
- List every important source/config/test file needed.
- Paths must be relative to the project.
- Commands must not contain shell operators.
- Do not include git commands.
- Include validation commands.
- Do not generate source code yet.`;
 return provider.json<DevelopmentPlan>(
  system,
  `PROJECT:\n${project.name}\n\nREQUIREMENT:\n${task.prompt}\n\nARCHITECTURE:\n${JSON.stringify(architecture,null,2)}`,
  task.id,
  project.id
 );
}
