import {getProjectGoal} from "../goals/goal.repository.js";
import {loadGoalTaskGraph} from "../goals/goal-task-graph.service.js";
import {projectMemory} from "../database/database.js";
import {repositoryIntelligence} from "../intelligence/repository-intelligence.service.js";
import {getActiveWorkAssignment,listGoalAssignments} from "./team-assignment.repository.js";
import {incomingHandoffContext} from "./handoff.service.js";
import type {SharedProjectContext} from "./shared-context.types.js";

function text(value:unknown){
 return String(value??"").trim();
}

function memoryContent(value:unknown){
 if(typeof value==="string")return value;
 try{return JSON.stringify(value);}catch{return String(value??"");}
}

function relevantMemories(projectId:string,limit=12){
 const rows=projectMemory(projectId) as any[];
 return rows.slice(0,Math.max(0,limit)).map(row=>({
  type:text(row.type),
  content:memoryContent(row.content),
  createdAt:text(row.created_at??row.createdAt)
 }));
}

function workQuery(goal:any,work:any,handoffs:any[]){
 return[
  goal.title,
  goal.objective,
  work.title,
  work.description,
  ...goal.requirements
   .filter((item:any)=>work.requirementIds.includes(item.id))
   .map((item:any)=>item.text),
  ...goal.acceptanceCriteria
   .filter((item:any)=>work.acceptanceCriterionIds.includes(item.id))
   .map((item:any)=>item.text),
  ...handoffs.flatMap(item=>[
   item.summary,
   ...item.decisions,
   ...item.recommendations,
   ...item.evidence.map((evidence:any)=>evidence.summary)
  ])
 ].map(text).filter(Boolean).join("\n");
}

function section(title:string,items:string[]){
 return items.length?`${title}:\n${items.map(item=>`- ${item}`).join("\n")}`:`${title}:\n- none`;
}

export async function buildSharedProjectContext(input:{
 goalId:string;
 workItemId:string;
 workspace:string;
 repositoryBudget?:number;
 memoryLimit?:number;
}):Promise<SharedProjectContext>{
 const goal=getProjectGoal(input.goalId);
 if(!goal)throw new Error(`Goal not found: ${input.goalId}`);
 const graph=loadGoalTaskGraph(goal.id);
 const work=graph.items.find(item=>item.id===input.workItemId);
 if(!work)throw new Error(`Goal work item not found: ${input.workItemId}`);
 const assignment=getActiveWorkAssignment(work.id)||
  listGoalAssignments(goal.id)
   .filter(item=>item.workItemId===work.id)
   .sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||
  null;
 const dependencyKeys=new Set(work.dependencies);
 const dependencies=graph.items
  .filter(item=>dependencyKeys.has(item.key))
  .map(item=>({
   id:item.id,
   key:item.key,
   title:item.title,
   description:item.description,
   kind:item.kind,
   status:item.status
  }));
 const handoffs=incomingHandoffContext(work.id);
 const query=workQuery(goal,work,handoffs);
 const repository=await repositoryIntelligence(
  input.workspace,
  query,
  input.repositoryBudget??40000
 );
 const requirements=goal.requirements
  .filter(item=>work.requirementIds.includes(item.id))
  .map(item=>({
   id:item.id,
   text:item.text,
   required:item.required,
   status:item.status
  }));
 const acceptanceCriteria=goal.acceptanceCriteria
  .filter(item=>work.acceptanceCriterionIds.includes(item.id))
  .map(item=>({
   id:item.id,
   text:item.text,
   status:item.status,
   evidence:item.evidence??null
  }));
 const constraints=goal.constraints.map(item=>({
  type:item.type,
  text:item.text
 }));
 const memories=relevantMemories(goal.projectId,input.memoryLimit??12);
 const prompt=[
  "PROJECT GOAL:",
  `Title: ${goal.title}`,
  `Objective: ${goal.objective}`,
  `Priority: ${goal.priority}`,
  `Goal status: ${goal.status}`,
  "",
  "CURRENT ASSIGNMENT:",
  `Work key: ${work.key}`,
  `Title: ${work.title}`,
  `Role: ${assignment?.role??"unassigned"}`,
  `Kind: ${work.kind}`,
  `Status: ${work.status}`,
  `Priority: ${work.priority}`,
  `Description: ${work.description}`,
  "",
  section("RELEVANT REQUIREMENTS",requirements.map(item=>`${item.id} [${item.status}]${item.required?" [required]":""} ${item.text}`)),
  "",
  section("RELEVANT ACCEPTANCE CRITERIA",acceptanceCriteria.map(item=>`${item.id} [${item.status}] ${item.text}${item.evidence?` | Evidence: ${item.evidence}`:""}`)),
  "",
  section("PROJECT CONSTRAINTS",constraints.map(item=>`[${item.type}] ${item.text}`)),
  "",
  section("DEPENDENCY WORK",dependencies.map(item=>`${item.key} [${item.status}] ${item.title}: ${item.description}`)),
  "",
  section("INCOMING HANDOFF SUMMARIES",handoffs.map(item=>item.summary)),
  "",
  section("PRIOR AGENT DECISIONS",handoffs.flatMap(item=>item.decisions)),
  "",
  section("HANDOFF ARTIFACTS",handoffs.flatMap(item=>item.artifacts.map(artifact=>`${artifact.path} (${artifact.type}): ${artifact.description}`))),
  "",
  section("HANDOFF EVIDENCE",handoffs.flatMap(item=>item.evidence.map(evidence=>`${evidence.type}: ${evidence.summary}${evidence.reference?` (${evidence.reference})`:""}`))),
  "",
  section("KNOWN RISKS",handoffs.flatMap(item=>item.risks)),
  "",
  section("PRIOR AGENT RECOMMENDATIONS",handoffs.flatMap(item=>item.recommendations)),
  "",
  section("RECENT PROJECT MEMORY",memories.map(item=>`[${item.type}] ${item.content}`)),
  "",
  "RELEVANT REPOSITORY CONTEXT:",
  repository.prompt
 ].join("\n");
 return{
  goal:{
   id:goal.id,
   projectId:goal.projectId,
   title:goal.title,
   objective:goal.objective,
   priority:goal.priority,
   status:goal.status
  },
  work:{
   id:work.id,
   key:work.key,
   title:work.title,
   description:work.description,
   kind:work.kind,
   status:work.status,
   priority:work.priority,
   role:assignment?.role??null
  },
  requirements,
  acceptanceCriteria,
  constraints,
  dependencies,
  handoffs,
  memory:memories,
  repository,
  query,
  prompt,
  generatedAt:new Date().toISOString()
 };
}

export function sharedProjectContextPrompt(context:SharedProjectContext){
 return context.prompt;
}
