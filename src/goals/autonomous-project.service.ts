import crypto from "node:crypto";
import {db} from "../database/database.js";
import {now} from "../config/config.js";
import {intakeProjectRequest,persistProjectIntake,type AIProjectIntakeResult} from "./project-intake.service.js";
import {decomposeGoalWithAI} from "./goal-decomposition.service.js";
import {createGoalTaskGraph} from "./goal-task-graph.service.js";
import {deleteGoalTaskGraph} from "./goal-task-graph.repository.js";
import {dispatchRunnableGoalWork} from "./goal-work-dispatch.service.js";
import {deleteGoalWorkDispatches} from "./goal-work-dispatch.repository.js";
import {deleteProjectGoal} from "./goal.repository.js";
import type {ProposedGoalTaskGraph} from "./goal-task-graph.types.js";

export interface AutonomousProjectBootstrapInput{
 name:string;
 request:string;
 workspace?:string;
 sourceTaskId?:string;
}
export interface AutonomousProjectBootstrapResult{
 projectId:string;
 goalId:string;
 graphItems:number;
 initialDispatches:number;
 taskIds:string[];
 jobIds:string[];
 clarificationNeeded:boolean;
 status:"waiting_clarification"|"queued";
}
export interface DeterministicBootstrapInput extends AutonomousProjectBootstrapInput{
 analysis:AIProjectIntakeResult;
 graph?:ProposedGoalTaskGraph;
}

const clean=(value:unknown)=>String(value??"").replace(/\s+/g," ").trim();
const slug=(value:string)=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80)||"project";
const projectId=()=>`prj_${crypto.randomBytes(8).toString("hex")}`;

function createProject(name:string,workspace?:string){
 const id=projectId();
 const time=now();
 const normalizedName=clean(name);
 if(!normalizedName)throw new Error("Project name is required.");
 const projectSlug=`${slug(normalizedName)}-${Date.now()}`;
 const path=clean(workspace)||`workspaces/${projectSlug}`;
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(id,normalizedName,projectSlug,"queued","goal_intake",0,path,time,time);
 return{id,name:normalizedName,slug:projectSlug,workspace:path};
}

function removeProject(projectId:string){
 db.prepare("DELETE FROM projects WHERE id=?").run(projectId);
}

function cleanupBootstrap(projectId:string,goalId?:string){
 if(goalId){
  const dispatches=db.prepare(
   "SELECT task_id FROM goal_work_dispatches WHERE goal_id=?"
  ).all(goalId) as any[];
  for(const dispatch of dispatches){
   db.prepare("DELETE FROM jobs WHERE task_id=?").run(dispatch.task_id);
   db.prepare("DELETE FROM tasks WHERE id=?").run(dispatch.task_id);
  }
  deleteGoalWorkDispatches(goalId);
  deleteGoalTaskGraph(goalId);
  deleteProjectGoal(goalId);
 }
 removeProject(projectId);
}

function finalizeBootstrap(project:any,goal:any,graph:ProposedGoalTaskGraph){
 createGoalTaskGraph(goal.id,graph);
 const dispatches=dispatchRunnableGoalWork(goal.id);
 const time=now();
 db.prepare(`
  UPDATE projects
  SET status='queued',phase='autonomous',progress=0,updated_at=?
  WHERE id=?
 `).run(time,project.id);
 return{
  projectId:project.id,
  goalId:goal.id,
  graphItems:graph.items.length,
  initialDispatches:dispatches.length,
  taskIds:dispatches.map(item=>item.taskId),
  jobIds:dispatches.map(item=>item.jobId).filter(Boolean) as string[],
  clarificationNeeded:false,
  status:"queued" as const
 };
}

export async function bootstrapAutonomousProject(
 input:AutonomousProjectBootstrapInput
):Promise<AutonomousProjectBootstrapResult>{
 const name=clean(input.name);
 const request=clean(input.request);
 if(!name)throw new Error("Project name is required.");
 if(!request)throw new Error("Project request is required.");

 const project=createProject(name,input.workspace);
 let goalId:string|undefined;

 try{
  const intake=await intakeProjectRequest({
   projectId:project.id,
   request,
   sourceTaskId:input.sourceTaskId
  });
  goalId=intake.goal.id;

  if(intake.analysis.clarificationNeeded){
   db.prepare(`
    UPDATE projects
    SET status='paused',phase='waiting_clarification',updated_at=?
    WHERE id=?
   `).run(now(),project.id);
   return{
    projectId:project.id,
    goalId:intake.goal.id,
    graphItems:0,
    initialDispatches:0,
    taskIds:[],
    jobIds:[],
    clarificationNeeded:true,
    status:"waiting_clarification"
   };
  }

  const graph=await decomposeGoalWithAI(intake.goal.id);
  return finalizeBootstrap(project,intake.goal,graph);
 }catch(error){
  cleanupBootstrap(project.id,goalId);
  throw error;
 }
}

export function bootstrapAutonomousProjectDeterministic(
 input:DeterministicBootstrapInput
):AutonomousProjectBootstrapResult{
 const name=clean(input.name);
 const request=clean(input.request);
 if(!name)throw new Error("Project name is required.");
 if(!request)throw new Error("Project request is required.");

 const project=createProject(name,input.workspace);
 let goalId:string|undefined;

 try{
  const intake=persistProjectIntake(
   {
    projectId:project.id,
    request,
    sourceTaskId:input.sourceTaskId
   },
   input.analysis
  );
  goalId=intake.goal.id;

  if(intake.analysis.clarificationNeeded){
   db.prepare(`
    UPDATE projects
    SET status='paused',phase='waiting_clarification',updated_at=?
    WHERE id=?
   `).run(now(),project.id);
   return{
    projectId:project.id,
    goalId:intake.goal.id,
    graphItems:0,
    initialDispatches:0,
    taskIds:[],
    jobIds:[],
    clarificationNeeded:true,
    status:"waiting_clarification"
   };
  }

  if(!input.graph)throw new Error("Task graph is required for deterministic bootstrap.");
  return finalizeBootstrap(project,intake.goal,input.graph);
 }catch(error){
  cleanupBootstrap(project.id,goalId);
  throw error;
 }
}
