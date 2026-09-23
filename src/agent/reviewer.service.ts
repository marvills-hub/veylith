import {getAIProvider} from "./provider.service.js";
import {sourceSnapshot} from "../runtime/filesystem.service.js";
import type {ArchitectureResult,DevelopmentPlan,ReviewResult} from "../orchestration/pipeline.types.js";

export async function reviewProject(task:any,project:any,architecture:ArchitectureResult,plan:DevelopmentPlan,validation:any):Promise<ReviewResult>{
 const provider=getAIProvider();
 const source=await sourceSnapshot(project.workspace);
 const system=`You are Veylith's software reviewer.
Review a generated project after automated validation.
Return ONLY valid JSON:
{
 "approved":true,
 "summary":"review summary",
 "issues":["specific issue"],
 "recommendations":["specific recommendation"]
}
Rules:
- Base the review on the supplied source and validation results.
- approved must be false when a concrete correctness issue remains.
- Do not reject merely for optional enhancements.
- Focus on correctness, completeness, runtime behavior and the user's requirement.
- Do not generate replacement source code.`;
 return provider.json<ReviewResult>(
  system,
  `REQUIREMENT:\n${task.prompt}\n\nARCHITECTURE:\n${JSON.stringify(architecture,null,2)}\n\nPLAN:\n${JSON.stringify(plan,null,2)}\n\nVALIDATION:\n${JSON.stringify(validation,null,2)}\n\nSOURCE:\n${source}`,
  task.id,
  project.id
 );
}
