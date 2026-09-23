import type {GoalConstraint,GoalPriority,ProjectGoal} from "./goal.types.js";
import {createGoal,prepareGoal} from "./goal.service.js";
import {getAIProvider} from "../agent/provider.service.js";

export interface AIProjectIntakeResult{
 title:string;
 objective:string;
 priority:GoalPriority;
 requirements:Array<{text:string;required:boolean}>;
 acceptanceCriteria:string[];
 constraints:Array<{type:GoalConstraint["type"];text:string}>;
 assumptions:string[];
 clarificationNeeded:boolean;
 clarificationQuestions:string[];
}

export interface ProjectIntakeInput{
 projectId:string;
 request:string;
 sourceTaskId?:string;
}

export interface ProjectIntakeResult{
 goal:ProjectGoal;
 analysis:AIProjectIntakeResult;
}

const allowedPriorities=new Set<GoalPriority>(["low","normal","high","critical"]);
const allowedConstraintTypes=new Set<GoalConstraint["type"]>([
 "technical","security","scope","quality","delivery","other"
]);

function clean(value:unknown){
 return String(value??"").replace(/\s+/g," ").trim();
}

function unique(values:string[]){
 return [...new Set(values.map(clean).filter(Boolean))];
}

function priority(value:unknown):GoalPriority{
 const normalized=clean(value).toLowerCase() as GoalPriority;
 return allowedPriorities.has(normalized)?normalized:"normal";
}

function constraintType(value:unknown):GoalConstraint["type"]{
 const normalized=clean(value).toLowerCase() as GoalConstraint["type"];
 return allowedConstraintTypes.has(normalized)?normalized:"other";
}

export function normalizeAIProjectIntake(raw:any,request:string):AIProjectIntakeResult{
 const requirementsRaw=Array.isArray(raw?.requirements)?raw.requirements:[];
 const criteriaRaw=Array.isArray(raw?.acceptanceCriteria)?raw.acceptanceCriteria:[];
 const constraintsRaw=Array.isArray(raw?.constraints)?raw.constraints:[];
 const assumptionsRaw=Array.isArray(raw?.assumptions)?raw.assumptions:[];
 const questionsRaw=Array.isArray(raw?.clarificationQuestions)?raw.clarificationQuestions:[];

 const requirementMap=new Map<string,{text:string;required:boolean}>();
 for(const item of requirementsRaw){
  const text=clean(typeof item==="string"?item:item?.text);
  if(!text)continue;
  const key=text.toLowerCase();
  const required=typeof item==="object"?item?.required!==false:true;
  const existing=requirementMap.get(key);
  if(!existing)requirementMap.set(key,{text,required});
  else if(required)existing.required=true;
 }

 const constraintMap=new Map<string,{type:GoalConstraint["type"];text:string}>();
 for(const item of constraintsRaw){
  const text=clean(typeof item==="string"?item:item?.text);
  if(!text)continue;
  const type=constraintType(typeof item==="object"?item?.type:"other");
  const key=`${type}:${text.toLowerCase()}`;
  if(!constraintMap.has(key))constraintMap.set(key,{type,text});
 }

 const fallbackObjective=clean(request);
 const title=clean(raw?.title)||fallbackObjective.slice(0,100)||"Untitled project goal";
 const objective=clean(raw?.objective)||fallbackObjective;

 const requirements=[...requirementMap.values()];
 const acceptanceCriteria=unique(criteriaRaw.map((item:any)=>
  typeof item==="string"?item:item?.text
 ));
 const constraints=[...constraintMap.values()];
 const assumptions=unique(assumptionsRaw);
 const clarificationQuestions=unique(questionsRaw);

 return{
  title,
  objective,
  priority:priority(raw?.priority),
  requirements,
  acceptanceCriteria,
  constraints,
  assumptions,
  clarificationNeeded:Boolean(raw?.clarificationNeeded)&&clarificationQuestions.length>0,
  clarificationQuestions
 };
}

export function validateAIProjectIntake(result:AIProjectIntakeResult){
 const problems:string[]=[];
 if(!result.title)problems.push("AI intake title is empty");
 if(!result.objective)problems.push("AI intake objective is empty");
 if(result.requirements.length===0)problems.push("AI intake produced no requirements");
 if(result.acceptanceCriteria.length===0)problems.push("AI intake produced no acceptance criteria");
 if(result.requirements.some(item=>!item.text))problems.push("AI intake contains an empty requirement");
 if(result.acceptanceCriteria.some(item=>!item))problems.push("AI intake contains an empty acceptance criterion");
 return{valid:problems.length===0,problems};
}

export async function analyzeProjectRequest(
 request:string,
 taskId:string,
 projectId:string
):Promise<AIProjectIntakeResult>{
 const normalizedRequest=clean(request);
 if(!normalizedRequest)throw new Error("Project request is required.");

 const provider=getAIProvider();
 if(!provider.configured)throw new Error("AI provider is not configured.");

 const system=`You are Veylith's autonomous project intake analyst.
Convert a human software-development request into a precise engineering goal.
Return ONLY valid JSON with this exact structure:
{
 "title":"short project goal title",
 "objective":"clear engineering objective",
 "priority":"low|normal|high|critical",
 "requirements":[
  {"text":"specific functional or technical requirement","required":true}
 ],
 "acceptanceCriteria":[
  "objective measurable condition proving the goal is complete"
 ],
 "constraints":[
  {"type":"technical|security|scope|quality|delivery|other","text":"constraint"}
 ],
 "assumptions":[
  "assumption made only when necessary"
 ],
 "clarificationNeeded":false,
 "clarificationQuestions":[]
}

Rules:
- Preserve the user's actual intent.
- Do not invent unrelated features.
- Break vague requests into concrete engineering requirements.
- Requirements describe what must be implemented.
- Acceptance criteria must be objectively verifiable.
- Include build, automated testing and requested runtime behavior where relevant.
- Security requirements must remain explicit.
- Do not silently remove user constraints.
- Do not choose critical priority unless the request explicitly indicates production emergency, severe outage, security incident or similarly urgent work.
- Prefer normal priority when urgency is unspecified.
- Use assumptions sparingly.
- Set clarificationNeeded true only when missing information genuinely prevents safe or meaningful implementation.
- Do not ask about details Veylith can reasonably determine from repository analysis later.
- Do not generate architecture, source code or implementation steps.`;

 const raw=await provider.json<any>(
  system,
  `PROJECT REQUEST:
${normalizedRequest}

Analyze this request into a durable autonomous-development goal.`,
  taskId,
  projectId
 );

 const result=normalizeAIProjectIntake(raw,normalizedRequest);
 const validation=validateAIProjectIntake(result);
 if(!validation.valid){
  throw new Error(`AI project intake invalid: ${validation.problems.join("; ")}`);
 }
 return result;
}

export function persistProjectIntake(
 input:ProjectIntakeInput,
 analysis:AIProjectIntakeResult
):ProjectIntakeResult{
 const normalized=normalizeAIProjectIntake(analysis,input.request);
 const validation=validateAIProjectIntake(normalized);
 if(!validation.valid){
  throw new Error(`Project intake invalid: ${validation.problems.join("; ")}`);
 }

 const goal=createGoal({
  projectId:input.projectId,
  title:normalized.title,
  objective:normalized.objective,
  priority:normalized.priority,
  requirements:normalized.requirements,
  acceptanceCriteria:normalized.acceptanceCriteria,
  constraints:normalized.constraints,
  sourceTaskId:input.sourceTaskId
 });

 if(normalized.clarificationNeeded){
  return{goal,analysis:normalized};
 }

 return{
  goal:prepareGoal(goal.id),
  analysis:normalized
 };
}

export async function intakeProjectRequest(input:ProjectIntakeInput):Promise<ProjectIntakeResult>{
 const request=clean(input.request);
 if(!input.projectId.trim())throw new Error("Project ID is required.");
 if(!request)throw new Error("Project request is required.");

 const analysis=await analyzeProjectRequest(
  request,
  input.sourceTaskId??`intake_${Date.now()}`,
  input.projectId
 );

 return persistProjectIntake({...input,request},analysis);
}
