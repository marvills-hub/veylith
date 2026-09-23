import crypto from "node:crypto";
import {
 createProjectGoal,
 getProjectGoal,
 listProjectGoals,
 replaceGoalDefinition,
 updateGoalStatus
} from "./goal.repository.js";
import type {
 CreateProjectGoalInput,
 GoalAcceptanceCriterion,
 GoalConstraint,
 GoalRequirement,
 ProjectGoal
} from "./goal.types.js";

const id=(prefix:string)=>`${prefix}_${crypto.randomBytes(8).toString("hex")}`;

function clean(value:string){
 return value.replace(/\s+/g," ").trim();
}

function unique(values:string[]){
 return [...new Set(values.map(clean).filter(Boolean))];
}

export function normalizeGoalInput(input:CreateProjectGoalInput):CreateProjectGoalInput{
 return{
  ...input,
  projectId:clean(input.projectId),
  title:clean(input.title),
  objective:clean(input.objective),
  requirements:unique((input.requirements??[]).map(x=>x.text)).map(text=>({
   text,
   required:(input.requirements??[]).find(x=>clean(x.text)===text)?.required!==false
  })),
  acceptanceCriteria:unique(input.acceptanceCriteria??[]),
  constraints:(input.constraints??[])
   .map(item=>({...item,text:clean(item.text)}))
   .filter(item=>item.text)
 };
}

export function validateGoal(goal:ProjectGoal){
 const problems:string[]=[];
 if(!goal.title.trim())problems.push("Goal title is empty");
 if(!goal.objective.trim())problems.push("Goal objective is empty");
 if(goal.requirements.length===0)problems.push("Goal has no requirements");
 if(goal.acceptanceCriteria.length===0)problems.push("Goal has no acceptance criteria");
 if(goal.requirements.some(x=>!x.text.trim()))problems.push("Goal contains empty requirement");
 if(goal.acceptanceCriteria.some(x=>!x.text.trim()))problems.push("Goal contains empty acceptance criterion");
 return{valid:problems.length===0,problems};
}

export function createGoal(input:CreateProjectGoalInput){
 return createProjectGoal(normalizeGoalInput(input));
}

export function prepareGoal(goalId:string):ProjectGoal{
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const result=validateGoal(goal);
 if(!result.valid)throw new Error(`Goal is not ready: ${result.problems.join("; ")}`);
 return updateGoalStatus(goalId,"ready");
}

export function activateGoal(goalId:string):ProjectGoal{
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 if(goal.status!=="ready"&&goal.status!=="blocked")throw new Error(`Goal cannot activate from ${goal.status}`);
 return updateGoalStatus(goalId,"active");
}

export function blockGoal(goalId:string){
 return updateGoalStatus(goalId,"blocked");
}

export function completeGoal(goalId:string):ProjectGoal{
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const unmet=goal.requirements.filter(x=>x.required&&x.status!=="satisfied");
 const failed=goal.acceptanceCriteria.filter(x=>x.status!=="passed");
 if(unmet.length||failed.length)throw new Error("Goal cannot complete until required requirements and acceptance criteria pass");
 return updateGoalStatus(goalId,"completed");
}

export function markRequirement(goalId:string,requirementId:string,status:GoalRequirement["status"]){
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const requirements=goal.requirements.map(item=>item.id===requirementId?{...item,status}:item);
 if(!requirements.some(item=>item.id===requirementId))throw new Error(`Requirement not found: ${requirementId}`);
 return replaceGoalDefinition(goalId,{requirements,acceptanceCriteria:goal.acceptanceCriteria,constraints:goal.constraints});
}

export function markAcceptanceCriterion(
 goalId:string,
 criterionId:string,
 status:GoalAcceptanceCriterion["status"],
 evidence?:string
){
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const acceptanceCriteria=goal.acceptanceCriteria.map(item=>
  item.id===criterionId?{...item,status,evidence:evidence?clean(evidence):item.evidence}:item
 );
 if(!acceptanceCriteria.some(item=>item.id===criterionId))throw new Error(`Acceptance criterion not found: ${criterionId}`);
 return replaceGoalDefinition(goalId,{requirements:goal.requirements,acceptanceCriteria,constraints:goal.constraints});
}

export function addRequirement(goalId:string,text:string,required=true){
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const requirement:GoalRequirement={id:id("req"),text:clean(text),required,status:"pending"};
 if(!requirement.text)throw new Error("Requirement text is required");
 return replaceGoalDefinition(goalId,{
  requirements:[...goal.requirements,requirement],
  acceptanceCriteria:goal.acceptanceCriteria,
  constraints:goal.constraints
 });
}

export function addAcceptanceCriterion(goalId:string,text:string){
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const criterion:GoalAcceptanceCriterion={id:id("acc"),text:clean(text),status:"pending"};
 if(!criterion.text)throw new Error("Acceptance criterion text is required");
 return replaceGoalDefinition(goalId,{
  requirements:goal.requirements,
  acceptanceCriteria:[...goal.acceptanceCriteria,criterion],
  constraints:goal.constraints
 });
}

export function addConstraint(goalId:string,type:GoalConstraint["type"],text:string){
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const constraint:GoalConstraint={id:id("con"),type,text:clean(text)};
 if(!constraint.text)throw new Error("Constraint text is required");
 return replaceGoalDefinition(goalId,{
  requirements:goal.requirements,
  acceptanceCriteria:goal.acceptanceCriteria,
  constraints:[...goal.constraints,constraint]
 });
}

export function goalsForProject(projectId:string){
 return listProjectGoals(projectId);
}
