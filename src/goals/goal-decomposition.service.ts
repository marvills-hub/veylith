import{getAIProvider}from"../agent/provider.service.js";
import{getProjectGoal}from"./goal.repository.js";
import{createGoalTaskGraph,normalizeProposedTaskGraph,validateProposedTaskGraph}from"./goal-task-graph.service.js";
import type{GoalTaskGraph,ProposedGoalTaskGraph}from"./goal-task-graph.types.js";

const MAX_DECOMPOSITION_ATTEMPTS=3;

export async function decomposeGoalWithAI(
 goalId:string,
 taskId=`goal_decompose_${Date.now()}`
):Promise<ProposedGoalTaskGraph>{
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 if(goal.status!=="ready"&&goal.status!=="active")
  throw new Error(`Goal must be ready or active before decomposition, received ${goal.status}`);

 const provider=getAIProvider();
 if(!provider.configured)throw new Error("AI provider is not configured.");

 const system=`You are Veylith's autonomous engineering work decomposer.
Convert one approved software-development goal into a complete dependency-aware task graph.
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
- EVERY acceptance criterion must be covered by at least one work item.
- Use requirement IDs and acceptance criterion IDs exactly as supplied.
- Do not invent requirement IDs or acceptance criterion IDs.
- Dependencies must reference work keys in this response.
- A work item cannot depend on itself.
- Never create dependency cycles.
- Include implementation work for required product behavior.
- Include test or validation work covering acceptance criteria where appropriate.
- Include documentation work when the goal requires documentation.
- Do not add final autonomous GitHub delivery or terminal final-review stages; Veylith creates those separately.
- Produce the smallest complete engineering graph that fully covers the goal.`;

 let previousProposal:ProposedGoalTaskGraph|null=null;
 let previousProblems:string[]=[];

 for(let attempt=1;attempt<=MAX_DECOMPOSITION_ATTEMPTS;attempt++){
  const repair=attempt===1?"":`

PREVIOUS PROPOSAL:
${JSON.stringify(previousProposal,null,2)}

THE PREVIOUS PROPOSAL WAS REJECTED BY VEYLITH:
${previousProblems.map(problem=>`- ${problem}`).join("\n")}

Repair the task graph.
Return the COMPLETE corrected graph, not a partial patch.
Every validation problem above must be resolved while preserving valid coverage and dependencies.`;

  const prompt=`PROJECT GOAL:
${JSON.stringify({
 id:goal.id,
 title:goal.title,
 objective:goal.objective,
 requirements:goal.requirements,
 acceptanceCriteria:goal.acceptanceCriteria,
 constraints:goal.constraints
},null,2)}
${repair}

Create the complete engineering task graph now.`;

  const raw=await provider.json<any>(
   system,
   prompt,
   `${taskId}_attempt_${attempt}`,
   goal.projectId
  );

  const proposal=normalizeProposedTaskGraph(raw);
  const validation=validateProposedTaskGraph(goalId,proposal);

  if(validation.valid)return validation.graph;

  previousProposal=validation.graph;
  previousProblems=validation.problems;
 }

 throw new Error(
  `AI goal decomposition remained invalid after ${MAX_DECOMPOSITION_ATTEMPTS} attempts: ${previousProblems.join("; ")}`
 );
}

export async function buildGoalTaskGraphWithAI(
 goalId:string,
 taskId?:string
):Promise<GoalTaskGraph>{
 const proposal=await decomposeGoalWithAI(goalId,taskId);
 return createGoalTaskGraph(goalId,proposal);
}