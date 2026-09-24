import {synchronizeTaskDevelopment} from "../development/development-lifecycle.service.js";
import {beginAutonomousLifecycle,checkpointAutonomousLifecycle,failAutonomousLifecycle,waitAutonomousLifecycle} from "../orchestration/v1/lifecycle/lifecycle.service.js";
import crypto from "node:crypto";
import {db,memory} from "../database/database.js";
import {now} from "../config/config.js";
import {event} from "../core/telemetry.js";
import {designArchitecture} from "../agent/architect.service.js";
import {createDevelopmentPlan} from "../agent/development-planner.service.js";
import {developProject} from "../agent/developer.service.js";
import {reviewProject} from "../agent/reviewer.service.js";
import {applyDevelopment,validateDevelopment} from "../orchestration/pipeline.service.js";
import {executeV1AutonomousDelivery} from "../orchestration/v1/autonomous-delivery.service.js";
import {buildSharedProjectContext} from "./shared-context.service.js";
import {buildAgentProjectContext} from "../context/agent-project-context.service.js";
import {synchronizeRepositoryLearning} from "../evolution/repository-learning-lifecycle.service.js";
import {
 prepareGoalTaskExecution,
 completeGoalTaskExecution,
 goalExecutionForTask
} from "./goal-team-execution.service.js";
import {consumeIncomingHandoffs,createWorkHandoff,deliverWorkHandoff} from "./handoff.service.js";
import {listGoalHandoffs} from "./handoff.repository.js";
import {loadGoalTaskGraph} from "../goals/goal-task-graph.service.js";
import {recoverGoalWork} from "./team-recovery.service.js";
import type {AgentRole} from "./team.types.js";
import {AIProviderError} from "../core/ai-error.service.js";
import type {
 ArchitectureResult,
 DevelopmentPlan,
 DevelopmentResult
} from "../orchestration/pipeline.types.js";

export type GoalRoleResultStatus="running"|"completed"|"failed";

export interface GoalRoleResult{
 id:string;
 goalId:string;
 projectId:string;
 workItemId:string;
 assignmentId:string;
 taskId:string;
 role:AgentRole;
 status:GoalRoleResultStatus;
 summary:string|null;
 result:any;
 error:string|null;
 startedAt:string;
 completedAt:string|null;
 updatedAt:string;
}

db.exec(`
CREATE TABLE IF NOT EXISTS goal_role_results(
 id TEXT PRIMARY KEY,
 goal_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 work_item_id TEXT NOT NULL,
 assignment_id TEXT NOT NULL,
 task_id TEXT NOT NULL,
 role TEXT NOT NULL,
 status TEXT NOT NULL,
 summary TEXT,
 result_json TEXT,
 error TEXT,
 started_at TEXT NOT NULL,
 completed_at TEXT,
 updated_at TEXT NOT NULL,
 UNIQUE(assignment_id)
);
CREATE INDEX IF NOT EXISTS idx_goal_role_results_goal
 ON goal_role_results(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_role_results_project
 ON goal_role_results(project_id);
CREATE INDEX IF NOT EXISTS idx_goal_role_results_work
 ON goal_role_results(work_item_id);
CREATE INDEX IF NOT EXISTS idx_goal_role_results_task
 ON goal_role_results(task_id);
CREATE INDEX IF NOT EXISTS idx_goal_role_results_status
 ON goal_role_results(status);
`);

function parseJSON(value:any){
 if(value===null||value===undefined||value==="")return null;
 try{return JSON.parse(String(value));}catch{return null;}
}

function mapResult(row:any):GoalRoleResult{
 return{
  id:String(row.id),
  goalId:String(row.goal_id),
  projectId:String(row.project_id),
  workItemId:String(row.work_item_id),
  assignmentId:String(row.assignment_id),
  taskId:String(row.task_id),
  role:row.role,
  status:row.status,
  summary:row.summary?String(row.summary):null,
  result:parseJSON(row.result_json),
  error:row.error?String(row.error):null,
  startedAt:String(row.started_at),
  completedAt:row.completed_at?String(row.completed_at):null,
  updatedAt:String(row.updated_at)
 };
}

export function getGoalRoleResult(id:string){
 const row=db.prepare("SELECT * FROM goal_role_results WHERE id=?").get(id);
 return row?mapResult(row):null;
}

export function getAssignmentRoleResult(assignmentId:string){
 const row=db.prepare(`
  SELECT *
  FROM goal_role_results
  WHERE assignment_id=?
  LIMIT 1
 `).get(assignmentId);
 return row?mapResult(row):null;
}

export function getWorkRoleResult(workItemId:string){
 const row=db.prepare(`
  SELECT *
  FROM goal_role_results
  WHERE work_item_id=?
  ORDER BY started_at DESC
  LIMIT 1
 `).get(workItemId);
 return row?mapResult(row):null;
}

export function listGoalRoleResults(goalId:string){
 return(db.prepare(`
  SELECT *
  FROM goal_role_results
  WHERE goal_id=?
  ORDER BY started_at,id
 `).all(goalId) as any[]).map(mapResult);
}

export function deleteGoalRoleResults(goalId:string){
 return Number(
  db.prepare("DELETE FROM goal_role_results WHERE goal_id=?").run(goalId).changes
 );
}

function beginRoleResult(input:{
 goalId:string;
 projectId:string;
 workItemId:string;
 assignmentId:string;
 taskId:string;
 role:AgentRole;
}){
 const existing=getAssignmentRoleResult(input.assignmentId);
 if(existing)return existing;
 const time=now();
 const id=`rrs_${crypto.randomBytes(8).toString("hex")}`;
 db.prepare(`
  INSERT INTO goal_role_results(
   id,goal_id,project_id,work_item_id,assignment_id,task_id,
   role,status,summary,result_json,error,started_at,completed_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,'running',NULL,NULL,NULL,?,NULL,?)
 `).run(
  id,
  input.goalId,
  input.projectId,
  input.workItemId,
  input.assignmentId,
  input.taskId,
  input.role,
  time,
  time
 );
 return getGoalRoleResult(id)!;
}

function completeRoleResult(id:string,summary:string,result:any){
 const time=now();
 db.prepare(`
  UPDATE goal_role_results
  SET status='completed',
      summary=?,
      result_json=?,
      error=NULL,
      completed_at=COALESCE(completed_at,?),
      updated_at=?
  WHERE id=?
 `).run(
  summary||null,
  JSON.stringify(result??null),
  time,
  time,
  id
 );
 return getGoalRoleResult(id)!;
}

function failRoleResult(id:string,error:unknown){
 const message=error instanceof Error?error.message:String(error);
 db.prepare(`
  UPDATE goal_role_results
  SET status='failed',error=?,updated_at=?
  WHERE id=?
 `).run(message,now(),id);
 return getGoalRoleResult(id)!;
}

function project(projectId:string){
 const row=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId) as any;
 if(!row)throw new Error(`Project not found: ${projectId}`);
 return row;
}

function resultSummary(role:AgentRole,result:any){
 if(result?.summary)return String(result.summary);
 if(role==="tester"){
  return result?.success
   ?"Validation completed successfully."
   :"Validation failed.";
 }
 if(role==="delivery"){
  return "Repository delivery completed.";
 }
 return `${role} work completed.`;
}

function dependencyResults(goalId:string,workItemId:string){
 const graph=loadGoalTaskGraph(goalId);
 const work=graph.items.find(item=>item.id===workItemId);
 if(!work)throw new Error(`Goal work item not found: ${workItemId}`);
 const keys=new Set(work.dependencies);
 return graph.items
  .filter(item=>keys.has(item.key))
  .map(item=>({
   work:item,
   roleResult:getWorkRoleResult(item.id)
  }));
}

function findResult<T>(
 dependencies:ReturnType<typeof dependencyResults>,
 predicate:(result:GoalRoleResult)=>boolean
):T|null{
 for(const dependency of dependencies){
  const result=dependency.roleResult;
  if(result&&result.status==="completed"&&predicate(result)){
   return result.result as T;
  }
 }
 return null;
}

function architectureFrom(
 dependencies:ReturnType<typeof dependencyResults>
):ArchitectureResult|null{
 for(const dependency of dependencies){
  const record=dependency.roleResult;
  if(!record||record.status!=="completed")continue;
  const raw=record.result;
  if(record.role==="architect"&&raw?.architecture)return raw.architecture;
  if(raw?.architecture?.summary&&Array.isArray(raw.architecture?.structure)){
   return raw.architecture;
  }
 }
 return null;
}

function planFrom(
 dependencies:ReturnType<typeof dependencyResults>
):DevelopmentPlan|null{
 for(const dependency of dependencies){
  const record=dependency.roleResult;
  if(!record||record.status!=="completed")continue;
  const raw=record.result;
  if(raw?.plan?.summary&&Array.isArray(raw.plan?.files))return raw.plan;
  if(record.role==="planner"&&raw?.summary&&Array.isArray(raw?.files))return raw;
 }
 return null;
}

function developmentFrom(
 dependencies:ReturnType<typeof dependencyResults>
):DevelopmentResult|null{
 for(const dependency of dependencies){
  const record=dependency.roleResult;
  if(!record||record.status!=="completed")continue;
  const raw=record.result;
  if(raw?.development?.summary&&Array.isArray(raw.development?.files)){
   return raw.development;
  }
  if(
   record.role==="developer"&&
   raw?.summary&&
   Array.isArray(raw?.files)&&
   Array.isArray(raw?.commands)
  ){
   return raw;
  }
 }
 return null;
}

function validationFrom(dependencies:ReturnType<typeof dependencyResults>){
 for(const dependency of dependencies){
  const record=dependency.roleResult;
  if(!record||record.status!=="completed")continue;
  if(record.result?.validation)return record.result.validation;
  if(record.role==="tester"&&typeof record.result?.success==="boolean"){
   return record.result;
  }
 }
 return null;
}

function syntheticArchitecture(context:any):ArchitectureResult{
 return{
  summary:`Use the existing repository architecture for ${context.work.title}.`,
  stack:context.repository?.profile?.frameworks??[],
  structure:context.repository?.context?.selectedFiles?.map((file:any)=>file.path)??[],
  decisions:["Preserve the existing repository architecture and make the smallest required change."],
  risks:[]
 };
}

async function executeArchitect(task:any,projectRow:any){
 const architecture=await designArchitecture(task,projectRow);
 return{
  summary:architecture.summary,
  architecture
 };
}

async function executePlanner(
 task:any,
 projectRow:any,
 context:any,
 dependencies:ReturnType<typeof dependencyResults>
){
 const architecture=architectureFrom(dependencies)||syntheticArchitecture(context);
 const plan=await createDevelopmentPlan(task,projectRow,architecture);
 return{
  summary:plan.summary,
  architecture,
  plan
 };
}

async function executeDeveloper(
 task:any,
 projectRow:any,
 context:any,
 dependencies:ReturnType<typeof dependencyResults>
){
 const architecture=architectureFrom(dependencies)||syntheticArchitecture(context);
 const existingPlan=planFrom(dependencies);
 const plan=existingPlan||await createDevelopmentPlan(task,projectRow,architecture);
 const development=await developProject(task,projectRow,architecture,plan);
 await applyDevelopment(development,task,projectRow,plan);
 return{
  summary:development.summary,
  architecture,
  plan,
  development
 };
}

async function executeTester(
 task:any,
 projectRow:any,
 dependencies:ReturnType<typeof dependencyResults>
){
 const development=developmentFrom(dependencies);
 if(!development){
  throw new Error("Tester requires a completed developer result with validation commands.");
 }
 let validation=await validateDevelopment(development,task,projectRow);
 let finalDevelopment=development;
 if(!validation.success){
  const managed=goalExecutionForTask(task.id);
  const assignment=managed
   ?db.prepare(`
     SELECT *
     FROM agent_assignments
     WHERE goal_id=? AND work_item_id=? AND status='working'
     ORDER BY created_at DESC
     LIMIT 1
    `).get(managed.goal.id,managed.workItemId) as any
   :null;
  const context=managed
   ?await buildSharedProjectContext({
     goalId:managed.goal.id,
     workItemId:managed.workItemId,
     workspace:projectRow.workspace
    })
   :null;
  const dependencies=managed
   ?dependencyResults(managed.goal.id,managed.workItemId)
   :[];
  const architecture=architectureFrom(dependencies)||
   (context?syntheticArchitecture(context):null);
  const plan=planFrom(dependencies);
  if(!managed||!assignment||!architecture||!plan){
   const failure=validation.failure;
   throw new Error(
    `Validation failed: ${failure?.command||"command"} ${(failure?.args||[]).join(" ")} | ${failure?.stderr||failure?.stdout||"unknown failure"}`
   );
  }
  const recovered=await recoverGoalWork({
   goalId:managed.goal.id,
   projectId:task.project_id,
   workItemId:managed.workItemId,
   assignmentId:String(assignment.id),
   task,
   project:projectRow,
   architecture,
   plan,
   development,
   failure:validation
  });
  if(!recovered.recovered){
   const failure=recovered.validation?.failure;
   throw new Error(
    `Team recovery exhausted: ${failure?.stderr||failure?.stdout||"validation still failing"}`
   );
  }
  finalDevelopment=recovered.development;
  validation=recovered.validation;
 }
 return{
  summary:"Validation completed successfully.",
  development:{
   summary:finalDevelopment.summary,
   files:finalDevelopment.files.map(file=>file.path),
   commands:finalDevelopment.commands
  },
  validation,
  recovered:finalDevelopment!==development
 };
}

async function executeReviewer(
 task:any,
 projectRow:any,
 context:any,
 dependencies:ReturnType<typeof dependencyResults>
){
 const architecture=architectureFrom(dependencies)||syntheticArchitecture(context);
 const plan=planFrom(dependencies);
 const development=developmentFrom(dependencies);
 const validation=validationFrom(dependencies);
 if(!plan)throw new Error("Reviewer requires a development plan.");
 if(!development)throw new Error("Reviewer requires a development result.");
 if(!validation)throw new Error("Reviewer requires validation evidence.");
 const review=await reviewProject(
  task,
  projectRow,
  architecture,
  plan,
  development,
  validation
 );
 if(!review.approved){
  throw new Error(
   `Review rejected: ${review.summary}${review.issues?.length?` | ${review.issues.join("; ")}`:""}`
  );
 }
 return{
  summary:review.summary,
  architecture,
  plan,
  development:{
   summary:development.summary,
   files:development.files.map(file=>file.path),
   commands:development.commands
  },
  validation,
  review
 };
}

async function executeDelivery(task:any,projectRow:any){
 const managed=goalExecutionForTask(task.id);
 if(!managed)throw new Error("v1 autonomous delivery requires a goal-managed task.");
 return executeV1AutonomousDelivery({
  task,
  project:projectRow,
  goalId:managed.goal.id,
  deliveryWorkItemId:managed.workItemId
 });
}

async function executeRole(
 role:AgentRole,
 task:any,
 projectRow:any,
 context:any,
 dependencies:ReturnType<typeof dependencyResults>
){
 switch(role){
  case "architect":
   return executeArchitect(task,projectRow);
  case "planner":
   return executePlanner(task,projectRow,context,dependencies);
  case "developer":
   return executeDeveloper(task,projectRow,context,dependencies);
  case "tester":
   return executeTester(task,projectRow,dependencies);
  case "reviewer":
   return executeReviewer(task,projectRow,context,dependencies);
  case "delivery":
   return executeDelivery(task,projectRow);
  case "documentation":
   return executeDeveloper(task,projectRow,context,dependencies);
  case "diagnostic":
  case "repair":
   throw new Error(`${role} is a recovery role and cannot execute as a normal graph work item yet.`);
  default:
   throw new Error(`Unsupported team role: ${role}`);
 }
}

function handoffExists(fromAssignmentId:string,toWorkItemId:string){
 return listGoalHandoffs(
  String(
   db.prepare("SELECT goal_id FROM agent_assignments WHERE id=?")
    .get(fromAssignmentId)?.goal_id??""
  )
 ).some(item=>
  item.fromAssignmentId===fromAssignmentId&&
  item.toWorkItemId===toWorkItemId&&
  item.status!=="cancelled"
 );
}

function createDependencyHandoffs(input:{
 goalId:string;
 workItemId:string;
 assignmentId:string;
 role:AgentRole;
 roleResult:GoalRoleResult;
}){
 const graph=loadGoalTaskGraph(input.goalId);
 const source=graph.items.find(item=>item.id===input.workItemId);
 if(!source)return[];
 const targets=graph.items.filter(item=>item.dependencies.includes(source.key));
 const created=[];
 for(const target of targets){
  if(handoffExists(input.assignmentId,target.id))continue;
  const handoff=createWorkHandoff({
   goalId:input.goalId,
   fromAssignmentId:input.assignmentId,
   toWorkItemId:target.id,
   summary:input.roleResult.summary||`${input.role} completed ${source.title}.`,
   decisions:[
    `${input.role} completed work item ${source.key}.`
   ],
   artifacts:[],
   evidence:[
    {
     type:input.role==="tester"?"validation":"other",
     summary:input.roleResult.summary||`${source.title} completed.`,
     reference:input.roleResult.id
    }
   ],
   risks:[],
   recommendations:[
    `Use role result ${input.roleResult.id} as upstream execution evidence.`
   ],
   metadata:{
    role:input.role,
    roleResultId:input.roleResult.id,
    sourceWorkKey:source.key
   }
  });
  created.push(deliverWorkHandoff(handoff.id));
 }
 return created;
}

export async function executeGoalTeamTask(task:any){
 const managed=goalExecutionForTask(task.id);
 if(!managed)return null;
 const prepared=prepareGoalTaskExecution(task.id);
 synchronizeTaskDevelopment(task.id);
 if(!prepared)return null;
 if(prepared.alreadyTerminal){
  return{
   managed:true,
   skipped:true,
   goalId:prepared.goalId,
   workItemId:prepared.workItemId
  };
 }
 if(!prepared.assignment){
  throw new Error(`No team assignment exists for goal work ${prepared.workItemId}.`);
 }
 const projectRow=project(task.project_id);
 beginAutonomousLifecycle({
  projectId:task.project_id,
  goalId:prepared.goalId,
  taskId:task.id,
  workItemId:prepared.workItemId
 });
 const agentContext=await buildAgentProjectContext({
  goalId:prepared.goalId,
  workItemId:prepared.workItemId,
  projectId:task.project_id,
  workspace:projectRow.workspace,
  role:prepared.assignment.role
 });
 const context=agentContext.shared;
 const executionTask={
  ...task,
  prompt:[
   task.prompt,
   "",
   "VEYLITH AUTONOMOUS PROJECT CONTEXT:",
   agentContext.prompt
  ].join("\n")
 };
 const roleResult=beginRoleResult({
  goalId:prepared.goalId,
  projectId:task.project_id,
  workItemId:prepared.workItemId,
  assignmentId:prepared.assignment.id,
  taskId:task.id,
  role:prepared.assignment.role
 });
 if(roleResult.status==="completed"){
  completeGoalTaskExecution(task.id);
  synchronizeTaskDevelopment(task.id);
  return{
   managed:true,
   resumed:true,
   roleResult
  };
 }
 try{
  consumeIncomingHandoffs(prepared.workItemId,prepared.assignment.id);
  const dependencies=dependencyResults(prepared.goalId,prepared.workItemId);
  event("team.role_started",`${prepared.assignment.role} started ${context.work.title}`,{
   taskId:task.id,
   projectId:task.project_id,
   component:"team-execution",
   data:{
    goalId:prepared.goalId,
    workItemId:prepared.workItemId,
    assignmentId:prepared.assignment.id,
    role:prepared.assignment.role
   }
  });
  const result=await executeRole(
   prepared.assignment.role,
   executionTask,
   projectRow,
   context,
   dependencies
  );
   if(prepared.assignment.role==="delivery"){
    const deliveryResult=result as Awaited<ReturnType<typeof executeDelivery>>;
    checkpointAutonomousLifecycle(prepared.goalId,"release",{
     status:"running",
     taskId:task.id,
     workItemId:prepared.workItemId,
     deliveryPlanId:deliveryResult.plan.id,
     publicationId:deliveryResult.publication.id,
     verificationId:deliveryResult.verification.id,
     releaseId:deliveryResult.release.id
    });
   }else{
    checkpointAutonomousLifecycle(prepared.goalId,"development",{
     status:"running",
     taskId:task.id,
     workItemId:prepared.workItemId
    });
   }
  const completed=completeRoleResult(
   roleResult.id,
   resultSummary(prepared.assignment.role,result),
   result
  );
  memory(
   task.project_id,
   "team_role_result",
   JSON.stringify({
    goalId:prepared.goalId,
    workItemId:prepared.workItemId,
    assignmentId:prepared.assignment.id,
    role:prepared.assignment.role,
    roleResultId:completed.id,
    summary:completed.summary
   })
  );
  const handoffs=createDependencyHandoffs({
   goalId:prepared.goalId,
   workItemId:prepared.workItemId,
   assignmentId:prepared.assignment.id,
   role:prepared.assignment.role,
   roleResult:completed
  });
  const advanced=completeGoalTaskExecution(task.id);
  synchronizeTaskDevelopment(task.id);
  event("team.role_completed",`${prepared.assignment.role} completed ${context.work.title}`,{
   taskId:task.id,
   projectId:task.project_id,
   component:"team-execution",
   data:{
    goalId:prepared.goalId,
    workItemId:prepared.workItemId,
    assignmentId:prepared.assignment.id,
    role:prepared.assignment.role,
    roleResultId:completed.id,
    handoffs:handoffs.length,
    nextDispatches:advanced?.dispatched?.length??0
   }
  });
  return{
   managed:true,
   roleResult:completed,
   handoffs,
   advanced
  };
  }catch(error){
  if(error instanceof AIProviderError&&error.retryable){
   waitAutonomousLifecycle(prepared.goalId,error);
   event("team.role_waiting_ai",`Role ${prepared.assignment.role} waiting for AI provider`,{
    taskId:task.id,
    projectId:task.project_id,
    component:"team-execution",
    level:"warn",
    data:{
     goalId:prepared.goalId,
     workItemId:prepared.workItemId,
     assignmentId:prepared.assignment.id,
     role:prepared.assignment.role,
     roleResultId:roleResult.id
    }
   });
   throw error;
  }
  failRoleResult(roleResult.id,error);
  failAutonomousLifecycle(prepared.goalId,error);
  throw error;
 }
}












