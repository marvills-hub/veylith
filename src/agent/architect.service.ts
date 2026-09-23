import {getAIProvider} from "./provider.service.js";
import type {ArchitectureResult} from "../orchestration/pipeline.types.js";

export async function designArchitecture(task:any,project:any):Promise<ArchitectureResult>{
 const provider=getAIProvider();
 if(!provider.configured)throw new Error("AI provider is not configured.");
 const system=`You are Veylith's software architect.
Analyze the requested software project before implementation.
Return ONLY valid JSON with this exact structure:
{
 "summary":"short architectural summary",
 "stack":["technology"],
 "structure":["important directory or module"],
 "decisions":["architectural decision"],
 "risks":["technical risk"]
}
Rules:
- Design for a complete runnable project.
- Prefer the smallest appropriate technology stack.
- Do not generate source code.
- Do not invent unnecessary infrastructure.
- Keep architecture practical for automated implementation and testing.`;
 return provider.json<ArchitectureResult>(
  system,
  `PROJECT NAME:\n${project.name}\n\nUSER REQUIREMENT:\n${task.prompt}`,
  task.id,
  project.id
 );
}
