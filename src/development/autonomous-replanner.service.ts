import{db}from"../database/database.js";
import{getAIProvider}from"../agent/provider.service.js";
import type{AIProvider}from"../agent/providers/provider.types.js";
import{getProjectGoal}from"../goals/goal.repository.js";
import{loadGoalTaskGraph}from"../goals/goal-task-graph.service.js";
import{repositoryIntelligence}from"../intelligence/repository-intelligence.service.js";
import{evaluateDevelopmentContinuation}from"./continuation-evaluator.service.js";
import{applyDevelopmentContinuation}from"./development-continuation.service.js";
import type{ContinuationWorkKind,ContinuationWorkProposal}from"./goal-expansion.types.js";
import type{AIContinuationPlan,AutonomousReplanResult,ReplanProviderOptions}from"./autonomous-replanner.types.js";

const kinds=new Set<ContinuationWorkKind>([
 "architecture","analysis","implementation","integration","test","review","documentation","delivery","other"
]);
const clean=(value:any)=>String(value??"").trim();
const strings=(value:any)=>Array.isArray(value)?[...new Set(value.map(clean).filter(Boolean))]:[];
const priority=(value:any)=>{
 const n=Number(value);
 return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):50;
};

export function normalizeAIContinuationPlan(raw:any):AIContinuationPlan{
 const source=Array.isArray(raw?.work)?raw.work:[];
 const used=new Set<string>();
 const work:ContinuationWorkProposal[]=[];
 for(const item of source){
  const key=clean(item?.key).toLowerCase()
   .replace(/[^a-z0-9_-]+/g,"-")
   .replace(/^-+|-+$/g,"")
   .slice(0,80);
  if(!key||used.has(key))continue;
  used.add(key);
  const kind=clean(item?.kind) as ContinuationWorkKind;
  work.push({
   key,
   title:clean(item?.title)||key,
   description:clean(item?.description)||clean(item?.title)||key,
   kind:kinds.has(kind)?kind:"other",
   priority:priority(item?.priority),
   dependencies:strings(item?.dependencies),
   requirementIds:strings(item?.requirementIds),
   acceptanceIds:strings(item?.acceptanceIds)
  });
 }
 return{
  reason:clean(raw?.reason)||"Additional work is required to satisfy the project goal.",
  work
 };
}

export function validateAIContinuationPlan(plan:AIContinuationPlan){
 const problems:string[]=[];
 if(!plan.work.length)problems.push("AI continuation plan contains no work.");
 if(plan.work.length>20)problems.push("AI continuation plan exceeds the 20-item safety limit.");
 for(const item of plan.work){
  if(!item.key)problems.push("Continuation work key is required.");
  if(!item.title)problems.push(`Continuation work "${item.key}" requires a title.`);
  if(!item.description)problems.push(`Continuation work "${item.key}" requires a description.`);
  if(!kinds.has(item.kind))problems.push(`Continuation work "${item.key}" has invalid kind "${item.kind}".`);
 }
 return{valid:problems.length===0,problems};
}

function sessionRow(sessionId:string){
 return db.prepare(`
  SELECT id,project_id,goal_id,status
  FROM development_sessions WHERE id=?
 `).get(sessionId) as any;
}

function projectRow(projectId:string){
 return db.prepare(`
  SELECT id,name,slug,status,phase,progress,workspace,summary
  FROM projects WHERE id=?
 `).get(projectId) as any;
}

export async function proposeDevelopmentContinuation(
 sessionId:string,
 options:ReplanProviderOptions={}
):Promise<AIContinuationPlan>{
 const session=sessionRow(sessionId);
 if(!session)throw new Error(`Development session not found: ${sessionId}`);
 if(!["active","paused"].includes(String(session.status)))
  throw new Error(`Development session ${sessionId} cannot be replanned from ${session.status}.`);

 const goal=getProjectGoal(String(session.goal_id));
 if(!goal)throw new Error(`Goal not found: ${session.goal_id}`);
 const project=projectRow(String(session.project_id));
 if(!project)throw new Error(`Project not found: ${session.project_id}`);

 const evaluation=evaluateDevelopmentContinuation(sessionId);
 if(evaluation.decision==="complete")
  throw new Error("Development goal is already satisfied; AI replanning is not required.");
 if(evaluation.decision==="repair")
  throw new Error("Development currently requires repair, not graph expansion.");

 const graph=loadGoalTaskGraph(goal.id);
 const provider:AIProvider=options.provider??getAIProvider();
 if(!provider.configured)throw new Error("AI provider is not configured.");

 let intelligence:any=null;
 try{
  intelligence=await repositoryIntelligence(
   String(project.workspace),
   [
    goal.title,
    goal.objective,
    ...goal.requirements.map(item=>item.text),
    ...goal.acceptanceCriteria.map(item=>item.text),
    "continuation missing requirements acceptance remaining work"
   ].join(" "),
   30000
  );
 }catch{
  intelligence=null;
 }

 const system=`You are Veylith's autonomous development replanner.
You inspect an existing long-running software-development goal after one development cycle and propose ONLY the additional work still required.

Return ONLY valid JSON:
{
 "reason":"why another development cycle is required",
 "work":[
  {
   "key":"unique-stable-key",
   "title":"short engineering task title",
   "description":"precise engineering outcome",
   "kind":"architecture|analysis|implementation|integration|test|review|documentation|delivery|other",
   "priority":50,
   "dependencies":["existing-or-proposed-work-key"],
   "requirementIds":["existing-goal-requirement-id"],
   "acceptanceIds":["existing-goal-acceptance-id"]
  }
 ]
}

Rules:
- Propose only NEW work that does not already exist in the graph.
- Do not rewrite, delete or duplicate existing work.
- Use only requirement IDs and acceptance IDs supplied in the goal.
- Dependencies must reference existing work keys or work keys proposed in this response.
- Never create dependency cycles.
- Prefer the smallest sufficient continuation.
- Every uncovered required requirement must be covered by proposed work when additional implementation is necessary.
- Every uncovered acceptance criterion must be covered by proposed validation/review work when necessary.
- Completed work may be used as a dependency.
- Failed work is handled by Veylith's repair system; do not duplicate failed work as continuation.
- Do not generate source code.
- Do not run commands.
- Do not use Git.
- Maximum 20 proposed work items.`;

 const prompt=`PROJECT:
${JSON.stringify(project,null,2)}

PROJECT GOAL:
${JSON.stringify({
 id:goal.id,
 title:goal.title,
 objective:goal.objective,
 requirements:goal.requirements,
 acceptanceCriteria:goal.acceptanceCriteria,
 constraints:goal.constraints
},null,2)}

CURRENT DEVELOPMENT GRAPH:
${JSON.stringify(graph.items.map(item=>({
 key:item.key,
 title:item.title,
 description:item.description,
 kind:item.kind,
 status:item.status,
 priority:item.priority,
 dependencies:item.dependencies,
 requirementIds:item.requirementIds,
 acceptanceIds:item.acceptanceCriterionIds
})),null,2)}

CONTINUATION EVALUATION:
${JSON.stringify(evaluation,null,2)}

REPOSITORY CONTEXT:
${intelligence?.prompt??"Repository intelligence unavailable for this planning attempt."}

Propose the minimum safe follow-up work required for the next development cycle.`;

 const raw=await provider.json<any>(
  system,
  prompt,
  options.taskId??`continuation_replan_${sessionId}_${Date.now()}`,
  String(session.project_id)
 );
 const plan=normalizeAIContinuationPlan(raw);
 const validation=validateAIContinuationPlan(plan);
 if(!validation.valid)
  throw new Error(`Invalid AI continuation plan: ${validation.problems.join("; ")}`);
 return plan;
}

export async function autonomouslyContinueDevelopment(
 sessionId:string,
 options:ReplanProviderOptions={}
):Promise<AutonomousReplanResult>{
 const evaluation=evaluateDevelopmentContinuation(sessionId);
 if(evaluation.decision==="complete")
  return{evaluation,plan:null,applied:false,continuation:null};
 if(evaluation.decision==="repair")
  return{evaluation,plan:null,applied:false,continuation:null};

 const plan=await proposeDevelopmentContinuation(sessionId,options);
 const continuation=applyDevelopmentContinuation(sessionId,plan.work,plan.reason);
 return{evaluation,plan,applied:true,continuation};
}




