import {getAIProvider} from "../agent/provider.service.js";
import {getProjectGoal} from "./goal.repository.js";
import {createGoalTaskGraph,normalizeProposedTaskGraph} from "./goal-task-graph.service.js";
import type {GoalTaskGraph,ProposedGoalTaskGraph} from "./goal-task-graph.types.js";

export async function decomposeGoalWithAI(
 goalId:string,
 taskId=`goal_decompose_${Date.now()}`
):Promise<ProposedGoalTaskGraph>{
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 if(goal.status!=="ready"&&goal.status!=="active"){
  throw new Error(`Goal must be ready or active before decomposition, received ${goal.status}`);
 }

 const provider=getAIProvider();
 if(!provider.configured)throw new Error("AI provider is not configured.");

 const system=`You are Veylith's autonomous engineering work decomposer.
Convert one approved software-development goal into a dependency-aware task graph.
Return ONLY valid JSON:
{
 "items":[
  {
   "key":"short-stable-key",
   "title":"work item title",
   "description":"precise engineering outcome",
   "kind":"analysis|architecture|implementation|test|review|documentation|integration|delivery|other",
   "priority":50,
   "dependencies":["other-work-key"],
   "requirementIds":["exact requirement id"],
   "acceptanceCriterionIds":["exact acceptance criterion id"]
  }
 ]
}

Rules:
- Every REQUIRED requirement must be covered by at least one work item.
- Every acceptance criterion must be covered by at least one work item.
- Use ONLY requirement and acceptance IDs supplied in the goal.
- Dependencies must reference work-item keys in this response.
- Never create dependency cycles.
- Keep tasks independently understandable and reasonably bounded.
- Separate implementation and validation when that improves recoverability.
- Architecture or analysis work must precede implementation when genuinely required.
- Validation must depend on the behavior it validates.
- Review work should follow implementation and validation when independent review is required.
- Review work should follow implementation and validation when independent review is required.
- Documentation must depend on the implementation it documents when applicable.
- Delivery must be last when delivery work is required.
- Do not create artificial tasks merely to increase task count.
- Do not generate source code.
- Do not use Git commands.
- Priority is 0-100, where larger numbers are scheduled first when dependencies allow.`;

 const raw=await provider.json<ProposedGoalTaskGraph>(
  system,
  `APPROVED PROJECT GOAL:
${JSON.stringify({
 id:goal.id,
 title:goal.title,
 objective:goal.objective,
 priority:goal.priority,
 requirements:goal.requirements.map(item=>({
  id:item.id,
  text:item.text,
  required:item.required
 })),
 acceptanceCriteria:goal.acceptanceCriteria.map(item=>({
  id:item.id,
  text:item.text
 })),
 constraints:goal.constraints
},null,2)}

Create the executable development task graph.`,
  taskId,
  goal.projectId
 );

 return normalizeProposedTaskGraph(raw);
}

export async function buildGoalTaskGraphWithAI(
 goalId:string,
 taskId?:string
):Promise<GoalTaskGraph>{
 const proposal=await decomposeGoalWithAI(goalId,taskId);
 return createGoalTaskGraph(goalId,proposal);
}




