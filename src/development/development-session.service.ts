import {db,memory} from "../database/database.js";
import {event} from "../core/telemetry.js";
import {loadGoalTaskGraph} from "../goals/goal-task-graph.service.js";
import {
 createDevelopmentSession,
 createDevelopmentMilestone,
 getDevelopmentSession,
 getActiveDevelopmentSession,
 getGoalDevelopmentSession,
 listDevelopmentMilestones,
 updateDevelopmentMilestone,
 updateDevelopmentSessionProgress,
 incrementDevelopmentSessionRecovery,
 setDevelopmentSessionState
} from "./development-session.repository.js";
import type {
 DevelopmentMilestone,
 DevelopmentMilestoneStatus,
 DevelopmentSessionSnapshot
} from "./development-session.types.js";

function milestoneKind(kind:string){
 if(kind==="architecture"||kind==="analysis")return "foundation";
 if(kind==="implementation"||kind==="integration"||kind==="other")return "development";
 if(kind==="test")return "validation";
 if(kind==="documentation")return "documentation";
 if(kind==="delivery")return "delivery";
 return "development";
}

const milestoneMeta:Record<string,{title:string;description:string;sequence:number}>={
 foundation:{
  title:"Foundation & Architecture",
  description:"Architecture, analysis and technical foundation.",
  sequence:10
 },
 development:{
  title:"Implementation",
  description:"Primary implementation and integration work.",
  sequence:20
 },
 validation:{
  title:"Validation",
  description:"Automated validation and quality verification.",
  sequence:30
 },
 documentation:{
  title:"Documentation",
  description:"Project documentation and supporting material.",
  sequence:40
 },
 delivery:{
  title:"Delivery",
  description:"Versioning, repository publication and delivery.",
  sequence:50
 }
};

function graphWork(goalId:string){
 return loadGoalTaskGraph(goalId).items;
}

function deriveMilestoneStatus(
 milestone:DevelopmentMilestone,
 statuses:string[]
):{status:DevelopmentMilestoneStatus;progress:number}{
 if(!statuses.length)return{status:"completed",progress:100};
 const completed=statuses.filter(status=>status==="completed").length;
 const failed=statuses.some(status=>status==="failed");
 const cancelled=statuses.some(status=>status==="cancelled");
 const blocked=statuses.some(status=>status==="blocked");
 const running=statuses.some(status=>status==="running");
 const ready=statuses.some(status=>status==="ready");
 const progress=Math.round((completed/statuses.length)*100);
 if(completed===statuses.length)return{status:"completed",progress:100};
 if(failed)return{status:"failed",progress};
 if(cancelled)return{status:"cancelled",progress};
 if(blocked&&!running&&!ready)return{status:"blocked",progress};
 if(running||ready||completed>0)return{status:"active",progress};
 return{status:milestone.status==="active"?"active":"pending",progress};
}

export function initializeDevelopmentSession(goalId:string){
 const goal=db.prepare("SELECT id,project_id,status FROM project_goals WHERE id=?").get(goalId) as any;
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const graph=graphWork(goalId);
 if(!graph.length)throw new Error(`Goal ${goalId} has no development task graph.`);
 const session=createDevelopmentSession(String(goal.project_id),goalId);
 const groups=new Map<string,string[]>();
 for(const item of graph){
  const key=milestoneKind(String(item.kind));
  const ids=groups.get(key)||[];
  ids.push(item.id);
  groups.set(key,ids);
 }
 for(const [key,workItemIds] of groups){
  const meta=milestoneMeta[key];
  createDevelopmentMilestone({
   sessionId:session.id,
   projectId:session.projectId,
   goalId,
   key,
   title:meta.title,
   description:meta.description,
   sequence:meta.sequence,
   workItemIds
  });
 }
 synchronizeDevelopmentSession(session.id);
 const result=getDevelopmentSession(session.id)!;
 event("development.session.started",`Development session ${result.id} started`,{
  projectId:result.projectId,
  data:{goalId:result.goalId,sessionId:result.id}
 });
 memory(result.projectId,"development_session",{
  action:"started",
  sessionId:result.id,
  goalId:result.goalId
 });
 return developmentSessionSnapshot(result.id);
}

export function synchronizeDevelopmentSession(sessionId:string):DevelopmentSessionSnapshot{
 const session=getDevelopmentSession(sessionId);
 if(!session)throw new Error(`Development session not found: ${sessionId}`);
 const work=graphWork(session.goalId);
 const byId=new Map(work.map(item=>[item.id,item]));
 let milestones=listDevelopmentMilestones(session.id);
 for(const milestone of milestones){
  const statuses=milestone.workItemIds
   .map(id=>byId.get(id)?.status)
   .filter((status):status is NonNullable<typeof status>=>status!==undefined);
  const derived=deriveMilestoneStatus(milestone,statuses);
  updateDevelopmentMilestone(milestone.id,derived.status,derived.progress);
 }
 milestones=listDevelopmentMilestones(session.id);
 const current=milestones.find(item=>item.status==="active")||
  milestones.find(item=>item.status==="pending")||
  milestones.find(item=>item.status==="blocked")||
  milestones.find(item=>item.status==="failed")||
  null;
 const total=milestones.length;
 const progress=total
  ?Math.round(milestones.reduce((sum,item)=>sum+item.progress,0)/total)
  :100;
 updateDevelopmentSessionProgress(session.id,progress,current?.id??null);
 const refreshed=getDevelopmentSession(session.id)!;
 const allCompleted=milestones.length>0&&milestones.every(item=>item.status==="completed");
 const anyFailed=milestones.some(item=>item.status==="failed");
 const anyCancelled=milestones.some(item=>item.status==="cancelled");
 const allTerminal=milestones.length>0&&milestones.every(item=>
  ["completed","failed","cancelled","blocked"].includes(item.status)
 );
 if(allCompleted&&refreshed.status!=="completed"){
  setDevelopmentSessionState(session.id,"completed");
  db.prepare(`
   UPDATE project_goals
   SET status='completed',
       completed_at=COALESCE(completed_at,?),
       updated_at=?
   WHERE id=? AND status NOT IN ('completed','cancelled')
  `).run(new Date().toISOString(),new Date().toISOString(),session.goalId);
  event("development.session.completed",`Development session ${session.id} completed`,{
   projectId:session.projectId,
   data:{goalId:session.goalId,sessionId:session.id}
  });
 }else if(allTerminal&&anyFailed&&refreshed.status==="active"){
  setDevelopmentSessionState(session.id,"failed",{failure:"Development graph reached a terminal state with failed milestones."});
 }else if(allTerminal&&anyCancelled&&refreshed.status==="active"){
  setDevelopmentSessionState(session.id,"cancelled",{reason:"Development graph reached a terminal state with cancelled milestones."});
 }
 return developmentSessionSnapshot(session.id);
}

export function recoverDevelopmentSession(projectId:string){
 const session=getActiveDevelopmentSession(projectId);
 if(!session)return null;
 const goal=db.prepare("SELECT id FROM project_goals WHERE id=?").get(session.goalId);
 if(!goal){
  const reason=`Orphaned development session: goal ${session.goalId} no longer exists.`;
  setDevelopmentSessionState(session.id,"failed",{failure:reason});
  event("development.session.orphaned",reason,{
   projectId,
   data:{goalId:session.goalId,sessionId:session.id}
  });
  memory(projectId,"development_session",{
   action:"orphaned",
   sessionId:session.id,
   goalId:session.goalId,
   reason
  });
  return developmentSessionSnapshot(session.id);
 }
 incrementDevelopmentSessionRecovery(session.id);
 if(session.status==="paused"){
  setDevelopmentSessionState(session.id,"active");
 }
 const snapshot=synchronizeDevelopmentSession(session.id);
 event("development.session.recovered",`Recovered development session ${session.id}`,{
  projectId,
  data:{
   goalId:session.goalId,
   sessionId:session.id,
   recoveryCount:snapshot.session.recoveryCount,
   currentMilestoneId:snapshot.session.currentMilestoneId
  }
 });
 memory(projectId,"development_session",{
  action:"recovered",
  sessionId:session.id,
  goalId:session.goalId,
  recoveryCount:snapshot.session.recoveryCount
 });
 return snapshot;
}

export function pauseDevelopmentSession(sessionId:string,reason="Paused"){
 const session=setDevelopmentSessionState(sessionId,"paused",{reason});
 event("development.session.paused",reason,{
  projectId:session.projectId,
  data:{goalId:session.goalId,sessionId}
 });
 return developmentSessionSnapshot(sessionId);
}

export function resumeDevelopmentSession(sessionId:string){
 const session=setDevelopmentSessionState(sessionId,"active");
 incrementDevelopmentSessionRecovery(sessionId);
 const snapshot=synchronizeDevelopmentSession(sessionId);
 event("development.session.resumed",`Development session ${sessionId} resumed`,{
  projectId:session.projectId,
  data:{goalId:session.goalId,sessionId}
 });
 return snapshot;
}

export function developmentSessionSnapshot(sessionId:string):DevelopmentSessionSnapshot{
 const session=getDevelopmentSession(sessionId);
 if(!session)throw new Error(`Development session not found: ${sessionId}`);
 const milestones=listDevelopmentMilestones(sessionId);
 const current=session.currentMilestoneId
  ?milestones.find(item=>item.id===session.currentMilestoneId)||null
  :null;
 return{session,milestones,currentMilestone:current};
}

export function goalDevelopmentSessionSnapshot(goalId:string){
 const session=getGoalDevelopmentSession(goalId);
 return session?developmentSessionSnapshot(session.id):null;
}



