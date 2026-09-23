import {db} from "../database/database.js";
import {listSlots} from "../workers/worker-slot.repository.js";

export type AgentState="waiting"|"working"|"completed"|"failed";

export interface DashboardAgent{
 id:string;
 name:string;
 role:string;
 phase:string;
 state:AgentState;
 stepId:string|null;
 title:string|null;
 startedAt:string|null;
 completedAt:string|null;
 error:string|null;
}

export interface DashboardPipelineStage{
 phase:string;
 label:string;
 state:AgentState;
}

const agents=[
 {id:"architect",name:"Architect",role:"System architecture",phases:["architecture"]},
 {id:"planner",name:"Development Planner",role:"Implementation planning",phases:["planning"]},
 {id:"developer",name:"Developer",role:"Code implementation",phases:["development"]},
 {id:"validator",name:"Validator",role:"Build and test validation",phases:["validation"]},
 {id:"reviewer",name:"Reviewer",role:"Autonomous code review",phases:["review"]},
 {id:"diagnostic",name:"Diagnostic Engineer",role:"Failure diagnosis",phases:["diagnosis"]},
 {id:"repair",name:"Repair Engineer",role:"Targeted autonomous repair",phases:["repair"]},
 {id:"versioning",name:"Version Controller",role:"Git commit and repository state",phases:["versioning"]},
 {id:"publisher",name:"Publisher",role:"GitHub publication",phases:["publishing"]}
] as const;

const pipeline=[
 ["architecture","Architecture"],
 ["planning","Planning"],
 ["development","Development"],
 ["validation","Validation"],
 ["review","Review"],
 ["diagnosis","Diagnosis"],
 ["repair","Repair"],
 ["versioning","Git"],
 ["publishing","GitHub"]
] as const;

function rows(projectId:string){
 return db.prepare(`
  SELECT id,task_id,project_id,phase,agent,title,status,sequence,error,
         started_at,completed_at,created_at,updated_at
  FROM development_steps
  WHERE project_id=?
  ORDER BY sequence ASC,created_at ASC
 `).all(projectId) as any[];
}

function latestByPhase(steps:any[]){
 const result=new Map<string,any>();
 for(const step of steps)result.set(String(step.phase),step);
 return result;
}

function normalizeState(status?:string):AgentState{
 if(status==="running")return"working";
 if(status==="completed")return"completed";
 if(status==="failed")return"failed";
 return"waiting";
}

function currentStep(steps:any[]){
 return [...steps].reverse().find(step=>step.status==="running")||null;
}

function agentStep(definition:(typeof agents)[number],steps:any[]){
 return [...steps].reverse().find(step=>
  definition.phases.includes(step.phase as never)||
  String(step.agent||"").toLowerCase()===definition.id
 )||null;
}

export function projectTeam(projectId:string){
 const project=db.prepare(`
  SELECT id,name,status,phase,progress,summary,created_at,updated_at,completed_at
  FROM projects WHERE id=?
 `).get(projectId) as any;
 if(!project)return null;

 const tasks=db.prepare(`
  SELECT id,title,status,phase,priority,attempts,repair_attempts,max_attempts,error,
         created_at,started_at,completed_at,updated_at
  FROM tasks
  WHERE project_id=?
  ORDER BY created_at DESC
 `).all(projectId) as any[];

 const steps=rows(projectId);
 const latest=latestByPhase(steps);
 const active=currentStep(steps);
 const slots=(listSlots() as any[]).filter(slot=>slot.project_id===projectId);

 const team:DashboardAgent[]=agents.map(definition=>{
  const step=agentStep(definition,steps);
  return{
   id:definition.id,
   name:definition.name,
   role:definition.role,
   phase:definition.phases[0],
   state:normalizeState(step?.status),
   stepId:step?.id||null,
   title:step?.title||null,
   startedAt:step?.started_at||null,
   completedAt:step?.completed_at||null,
   error:step?.error||null
  };
 });

 const pipelineStages:DashboardPipelineStage[]=pipeline.map(([phase,label])=>{
  const step=latest.get(phase);
  let state=normalizeState(step?.status);
  if(!step&&project.status==="completed")state="completed";
  return{phase,label,state};
 });

 const activeAgent=active
  ?team.find(agent=>agent.phase===active.phase)||
   {
    id:String(active.agent||active.phase),
    name:String(active.agent||active.phase),
    role:String(active.title||active.phase),
    phase:String(active.phase),
    state:"working" as AgentState,
    stepId:active.id,
    title:active.title,
    startedAt:active.started_at,
    completedAt:active.completed_at,
    error:active.error
   }
  :null;

 return{
  project,
  task:tasks[0]||null,
  tasks,
  team,
  pipeline:pipelineStages,
  current:{
   phase:project.phase,
   progress:Number(project.progress||0),
   step:active,
   agent:activeAgent
  },
  workers:slots,
  repairs:{
   used:Number(tasks[0]?.repair_attempts||0),
   max:6
  },
  steps
 };
}

export function activeProjectTeams(limit=20){
 const projects=db.prepare(`
  SELECT id
  FROM projects
  ORDER BY
   CASE status
    WHEN 'active' THEN 0
    WHEN 'queued' THEN 1
    WHEN 'paused' THEN 2
    ELSE 3
   END,
   updated_at DESC
  LIMIT ?
 `).all(Math.max(1,Math.min(limit,100))) as any[];

 return projects
  .map(project=>projectTeam(project.id))
  .filter(Boolean);
}
