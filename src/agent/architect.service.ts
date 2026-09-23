import {getAIProvider} from "./provider.service.js";
import {changeAwareContext} from "../intelligence/change-context.service.js";
import type {ArchitectureResult} from "../orchestration/pipeline.types.js";

export async function designArchitecture(task:any,project:any):Promise<ArchitectureResult>{
 const provider=getAIProvider();
 if(!provider.configured)throw new Error("AI provider is not configured.");
 const intelligence=await changeAwareContext(project.workspace,task.prompt,24000);
 const system=`You are Veylith's software architect.
Analyze the requested software project before implementation.
You are working with an ACTUAL repository and a deterministic CHANGE ANALYSIS.
Return ONLY valid JSON with this exact structure:
{
 "summary":"short architectural summary",
 "stack":["technology"],
 "structure":["important directory or module"],
 "decisions":["architectural decision"],
 "risks":["technical risk"]
}
Rules:
- Respect REPOSITORY MODE and CHANGE INTENT.
- For an existing repository, preserve the existing architecture unless the requirement specifically requires architectural change.
- Treat LIKELY EXISTING TARGETS as investigation priorities, not mandatory edits.
- Follow PRESERVATION RULES.
- Use repository context as evidence.
- Do not invent dependencies contradicted by repository context.
- Design for a complete runnable result.
- Prefer the smallest appropriate architectural change.
- Do not generate source code.
- Do not invent unnecessary infrastructure.`;
 return provider.json<ArchitectureResult>(
  system,
  `PROJECT NAME:
${project.name}

USER REQUIREMENT:
${task.prompt}

${intelligence.prompt}`,
  task.id,
  project.id
 );
}
