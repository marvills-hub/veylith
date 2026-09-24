import{db}from"../dist/database/database.js";
import{
 getDevelopmentSession,
 getDevelopmentMilestone
}from"../dist/development/development-session.repository.js";
import{
 getDevelopmentCycle
}from"../dist/development/development-cycle.repository.js";

const[
 sessionId,
 milestoneId,
 cycleId,
 workId,
 goalId,
 projectId
]=process.argv.slice(2);

if(!sessionId||!milestoneId||!cycleId||!workId||!goalId||!projectId){
 throw new Error("Missing restart probe identifiers.");
}

const session=getDevelopmentSession(sessionId);

if(
 session&&
 session.id===sessionId&&
 session.status==="active"&&
 session.currentMilestoneId===milestoneId&&
 session.progress===35
){
 console.log("RESTART_SESSION_OK");
}else{
 throw new Error("Persistent development session unavailable or changed after restart.");
}

const milestone=getDevelopmentMilestone(milestoneId);

if(
 milestone&&
 milestone.id===milestoneId&&
 milestone.sessionId===sessionId&&
 milestone.status==="active"&&
 milestone.progress===35&&
 milestone.sequence===1&&
 milestone.workItemIds.includes(workId)
){
 console.log("RESTART_MILESTONE_OK");
}else{
 throw new Error("Persistent development milestone unavailable or changed after restart.");
}

const cycle=getDevelopmentCycle(cycleId);

if(
 cycle&&
 cycle.id===cycleId&&
 cycle.sessionId===sessionId&&
 cycle.status==="active"&&
 cycle.number===1&&
 cycle.workItemIds.includes(workId)
){
 console.log("RESTART_CYCLE_OK");
}else{
 throw new Error("Persistent development cycle unavailable or changed after restart.");
}

const work=db.prepare(`
 SELECT id,goal_id,project_id,status
 FROM goal_work_items
 WHERE id=?
`).get(workId);

if(
 work&&
 work.id===workId&&
 work.goal_id===goalId&&
 work.project_id===projectId&&
 work.status==="ready"
){
 console.log("RESTART_WORK_OK");
}else{
 throw new Error("Persistent goal work unavailable or changed after restart.");
}

if(
 session.goalId===goalId&&
 session.projectId===projectId&&
 milestone.goalId===goalId&&
 milestone.projectId===projectId&&
 cycle.goalId===goalId&&
 cycle.projectId===projectId
){
 console.log("RESTART_OWNERSHIP_OK");
}else{
 throw new Error("Persistent ownership links changed after restart.");
}
