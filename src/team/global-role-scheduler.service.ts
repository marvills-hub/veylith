import {db} from "../database/database.js";
import {event} from "../core/telemetry.js";
import {listProjectGoals} from "../goals/goal.repository.js";
import {refreshGoalTaskReadiness,loadGoalTaskGraph} from "../goals/goal-task-graph.service.js";
import {dispatchRunnableGoalWork,synchronizeGoalWorkDispatches} from "../goals/goal-work-dispatch.service.js";
import {getGoalWorkDispatch} from "../goals/goal-work-dispatch.repository.js";
import {roleForWorkKind} from "./team-role.service.js";
import {assignRunnableGoalTeam,synchronizeGoalTeam} from "./team-assignment.service.js";
import {claimAgentAssignment,getActiveWorkAssignment} from "./team-assignment.repository.js";
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
 projectStatus:string;
 projectPriority:number;
 goalPriority:number;
 workItemId:string;
 workKey:string;
 title:string;
 assignmentId:string;
 taskId:string|null;
 lastProject:boolean;
};

function projectRows(){
 return db.prepare(`
  SELECT id,status,created_at
  FROM projects
  WHERE status NOT IN ('completed','failed','cancelled')
  ORDER BY
   CASE status
    WHEN 'active' THEN 0
    WHEN 'running' THEN 0
    WHEN 'queued' THEN 1
    WHEN 'planned' THEN 2
    ELSE 3
   END,
   created_at
 `).all() as any[];
}

function projectRank(status:string){
 const value=String(status||"").toLowerCase();
 if(value==="active"||value==="running")return 0;
 if(value==="queued")return 1;
 if(value==="planned"||value==="ready")return 2;
 return 3;
}

function taskForWork(workItemId:string){
 const dispatch=getGoalWorkDispatch(workItemId);
 if(!dispatch)return null;
 return String(dispatch.taskId||"")||null;
}

function synchronizeAllGoals(){
 const goals=listProjectGoals();
 for(const goal of goals){
  if(["completed","failed","cancelled"].includes(String(goal.status)))continue;
  try{
   synchronizeGoalWorkDispatches(goal.id);
   refreshGoalTaskReadiness(goal.id);
   synchronizeGoalTeam(goal.id);
   assignRunnableGoalTeam(goal.id);
   dispatchRunnableGoalWork(goal.id);
  }catch(error){
   event("scheduler.goal_sync_failed",`Global scheduler could not synchronize ${goal.title}`,{
    projectId:goal.projectId,
    component:"global-role-scheduler",
    level:"warn",
    data:{goalId:goal.id,error:error instanceof Error?error.message:String(error)}
   });
  }
 }
}

function candidatesFor(role:AgentRole):Candidate[]{
 const worker=getSemanticWorker(role);
 const projects=new Map(projectRows().map(row=>[String(row.id),row]));
 const goals=listProjectGoals().filter(
  goal=>!["completed","failed","cancelled"].includes(String(goal.status))
 );
 const candidates:Candidate[]=[];
 for(const goal of goals){
  const project=projects.get(goal.projectId);
  if(!project)continue;
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
    projectStatus:String(project.status||""),
    projectPriority:0,
    goalPriority:Number(goal.priority||0),
    workItemId:work.id,
    workKey:work.key,
    title:work.title,
    assignmentId:assignment.id,
    taskId:taskForWork(work.id),
    lastProject:Boolean(worker?.lastProjectId&&worker.lastProjectId===goal.projectId)
   });
  }
 }
 return candidates.sort((a,b)=>
  Number(b.lastProject)-Number(a.lastProject)||
  projectRank(a.projectStatus)-projectRank(b.projectStatus)||
  b.goalPriority-a.goalPriority||
  a.workKey.localeCompare(b.workKey)
 );
}

function claimCandidate(candidate:Candidate){
 const workerId=`worker:${candidate.role}`;
 const previous=getSemanticWorker(candidate.role);
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
 const crossProject=Boolean(
  previous?.lastProjectId&&previous.lastProjectId!==candidate.projectId
 );
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
  component:"global-role-scheduler",
  data:{
   workerId,
   role:candidate.role,
   goalId:candidate.goalId,
   workItemId:candidate.workItemId,
   assignmentId:assignment.id,
   crossProject
  }
 });
 return assignment;
}

export function runGlobalRoleScheduler(){
 ensureSemanticWorkers();
 synchronizeAllGoals();
 const results=[];
 for(const role of SEMANTIC_WORKER_ROLES){
  const worker=getSemanticWorker(role);
  if(worker?.assignmentId){
   const assignment=db.prepare(
    "SELECT status FROM agent_assignments WHERE id=?"
   ).get(worker.assignmentId) as any;
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
    results.push({
     role,
     status:String(assignment.status),
     assignmentId:worker.assignmentId
    });
    continue;
   }
  }
  const candidates=candidatesFor(role);
  let claimed:any=null;
  for(const candidate of candidates){
   claimed=claimCandidate(candidate);
   if(claimed)break;
  }
  if(claimed){
   results.push({role,status:"assigned",assignmentId:claimed.id});
   continue;
  }
  updateSemanticWorker(role,{
   status:"idle",
   projectId:null,
   goalId:null,
   workItemId:null,
   assignmentId:null,
   taskId:null,
   blockedReason:"No dependency-ready role-matching work exists across current, active, queued or planned projects."
  });
  results.push({role,status:"idle"});
 }
 return results;
}

export function semanticWorkerSnapshot(){
 ensureSemanticWorkers();
 return listSemanticWorkers().map(worker=>{
  const project=worker.projectId
   ?db.prepare(
    "SELECT id,name,status,phase,progress FROM projects WHERE id=?"
   ).get(worker.projectId)
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
   progress:project?Number((project as any).progress||0):0,
   events:recentEvents
  };
 });
}
