import {db} from "../database/database.js";
import {event} from "../core/telemetry.js";
import {listProjectGoals} from "../goals/goal.repository.js";
import {refreshGoalTaskReadiness,loadGoalTaskGraph} from "../goals/goal-task-graph.service.js";
import {dispatchRunnableGoalWork,synchronizeGoalWorkDispatches} from "../goals/goal-work-dispatch.service.js";
import {getGoalWorkDispatch} from "../goals/goal-work-dispatch.repository.js";
import {roleForWorkKind} from "./team-role.service.js";
import {assignRunnableGoalTeam,synchronizeGoalTeam} from "./team-assignment.service.js";
import {claimAgentAssignment,getActiveWorkAssignment} from "./team-assignment.repository.js";
import {focusedProjectId,getVeylithFocus} from "../core/project-focus.service.js";
import {
 SEMANTIC_WORKER_ROLES,
 ensureSemanticWorkers,
 getSemanticWorker,
 listSemanticWorkers,
 updateSemanticWorker
} from "./semantic-worker.service.js";
import type {AgentRole} from "./team.types.js";

type Candidate={
 role:AgentRole;
 goalId:string;
 projectId:string;
 goalPriority:number;
 workItemId:string;
 workKey:string;
 title:string;
 assignmentId:string;
 taskId:string|null;
};

function taskForWork(workItemId:string){
 const dispatch=getGoalWorkDispatch(workItemId);
 if(!dispatch)return null;
 return String(dispatch.taskId||"")||null;
}

function synchronizeFocusedGoals(projectId:string){
 const goals=listProjectGoals(projectId);
 for(const goal of goals){
  if(["completed","failed","cancelled"].includes(String(goal.status)))continue;
  try{
   synchronizeGoalWorkDispatches(goal.id);
   refreshGoalTaskReadiness(goal.id);
   synchronizeGoalTeam(goal.id);
   assignRunnableGoalTeam(goal.id);
   dispatchRunnableGoalWork(goal.id);
  }catch(error){
   event("scheduler.goal_sync_failed",`Focused scheduler could not synchronize ${goal.title}`,{
    projectId:goal.projectId,
    component:"focused-role-scheduler",
    level:"warn",
    data:{goalId:goal.id,error:error instanceof Error?error.message:String(error)}
   });
  }
 }
}

function candidatesFor(role:AgentRole,projectId:string):Candidate[]{
 const worker=getSemanticWorker(role);
 const goals=listProjectGoals(projectId).filter(
  goal=>!["completed","failed","cancelled"].includes(String(goal.status))
 );
 const candidates:Candidate[]=[];
 for(const goal of goals){
  const graph=loadGoalTaskGraph(goal.id);
  for(const work of graph.items){
   if(work.status!=="ready"&&work.status!=="running")continue;
   if(roleForWorkKind(work.kind)!==role)continue;
   const assignment=getActiveWorkAssignment(work.id);
   if(!assignment)continue;
   if(assignment.role!==role)continue;
   if(assignment.status==="working"&&assignment.ownerToken!==worker?.id)continue;
   candidates.push({
    role,
    goalId:goal.id,
    projectId:goal.projectId,
    goalPriority:Number(goal.priority||0),
    workItemId:work.id,
    workKey:work.key,
    title:work.title,
    assignmentId:assignment.id,
    taskId:taskForWork(work.id)
   });
  }
 }
 return candidates.sort((a,b)=>
  b.goalPriority-a.goalPriority||
  a.workKey.localeCompare(b.workKey)
 );
}

function claimCandidate(candidate:Candidate){
 const workerId=`worker:${candidate.role}`;
 const current=getActiveWorkAssignment(candidate.workItemId);
 if(!current)return null;
 let assignment=current;
 if(current.status==="assigned"){
  try{
   assignment=claimAgentAssignment(current.id,workerId);
  }catch{
   return null;
  }
 }else if(current.ownerToken!==workerId){
  return null;
 }
 updateSemanticWorker(candidate.role,{
  status:"assigned",
  projectId:candidate.projectId,
  goalId:candidate.goalId,
  workItemId:candidate.workItemId,
  assignmentId:assignment.id,
  taskId:candidate.taskId,
  blockedReason:null
 });
 event("scheduler.role_assigned",`${candidate.role} assigned ${candidate.title}`,{
  projectId:candidate.projectId,
  taskId:candidate.taskId||undefined,
  component:"focused-role-scheduler",
  data:{
   workerId,
   role:candidate.role,
   goalId:candidate.goalId,
   workItemId:candidate.workItemId,
   assignmentId:assignment.id
  }
 });
 return assignment;
}

function idleWorker(role:AgentRole,reason:string){
 updateSemanticWorker(role,{
  status:"idle",
  projectId:null,
  goalId:null,
  workItemId:null,
  assignmentId:null,
  taskId:null,
  blockedReason:reason
 });
}

export function runGlobalRoleScheduler(){
 ensureSemanticWorkers();
 const projectId=focusedProjectId();
 if(!projectId){
  for(const role of SEMANTIC_WORKER_ROLES){
   const worker=getSemanticWorker(role);
   if(worker?.assignmentId){
    const assignment=db.prepare("SELECT status FROM agent_assignments WHERE id=?").get(worker.assignmentId) as any;
    if(assignment&&["assigned","working"].includes(String(assignment.status)))continue;
   }
   idleWorker(role,"Waiting for the user to select a project.");
  }
  return SEMANTIC_WORKER_ROLES.map(role=>({role,status:getSemanticWorker(role)?.status||"idle"}));
 }
 const project=db.prepare("SELECT id,status FROM projects WHERE id=?").get(projectId) as any;
 if(!project||["failed","cancelled"].includes(String(project.status))){
  for(const role of SEMANTIC_WORKER_ROLES)idleWorker(role,"Focused project is unavailable.");
  return SEMANTIC_WORKER_ROLES.map(role=>({role,status:"idle"}));
 }
 synchronizeFocusedGoals(projectId);
 const results=[];
 for(const role of SEMANTIC_WORKER_ROLES){
  const worker=getSemanticWorker(role);
  if(worker?.assignmentId&&worker.projectId===projectId){
   const assignment=db.prepare("SELECT status FROM agent_assignments WHERE id=?").get(worker.assignmentId) as any;
   if(assignment&&["assigned","working"].includes(String(assignment.status))){
    updateSemanticWorker(role,{
     status:String(assignment.status)==="working"?"working":"assigned",
     projectId:worker.projectId,
     goalId:worker.goalId,
     workItemId:worker.workItemId,
     assignmentId:worker.assignmentId,
     taskId:worker.taskId,
     blockedReason:null
    });
    results.push({role,status:String(assignment.status),assignmentId:worker.assignmentId});
    continue;
   }
  }
  const candidates=candidatesFor(role,projectId);
  let claimed:any=null;
  for(const candidate of candidates){
   claimed=claimCandidate(candidate);
   if(claimed)break;
  }
  if(claimed){
   results.push({role,status:"assigned",assignmentId:claimed.id});
   continue;
  }
  idleWorker(role,"No dependency-ready role-matching work exists in the focused project.");
  results.push({role,status:"idle"});
 }
 return results;
}

export function semanticWorkerSnapshot(){
 ensureSemanticWorkers();
 const focus=getVeylithFocus();
 return listSemanticWorkers().map(worker=>{
  const project=worker.projectId
   ?db.prepare("SELECT id,name,status,phase,progress FROM projects WHERE id=?").get(worker.projectId)
   :null;
  const task=worker.taskId
   ?db.prepare(`
    SELECT id,title,status,phase,priority,attempts,repair_attempts
    FROM tasks
    WHERE id=?
   `).get(worker.taskId)
   :null;
  const recentEvents=worker.projectId
   ?db.prepare(`
    SELECT id,type,worker_id,project_id,task_id,level,message,data,created_at
    FROM events
    WHERE project_id=?
    ORDER BY id DESC
    LIMIT 50
   `).all(worker.projectId).filter((row:any)=>{
    try{
     const data=JSON.parse(String(row.data||"{}"));
     return data?.role===worker.role||data?.workerId===worker.id;
    }catch{
     return false;
    }
   }).slice(0,20)
   :[];
  return{
   ...worker,
   project,
   task,
   focused:Boolean(focus.projectId&&worker.projectId===focus.projectId),
   progress:project?Number((project as any).progress||0):0,
   events:recentEvents
  };
 });
}
