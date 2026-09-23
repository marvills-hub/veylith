export type GoalStatus="draft"|"ready"|"active"|"blocked"|"completed"|"cancelled";
export type GoalPriority="low"|"normal"|"high"|"critical";
export interface GoalRequirement{
 id:string;
 text:string;
 required:boolean;
 status:"pending"|"satisfied"|"failed";
}
export interface GoalAcceptanceCriterion{
 id:string;
 text:string;
 status:"pending"|"passed"|"failed";
 evidence?:string;
}
export interface GoalConstraint{
 id:string;
 type:"technical"|"security"|"scope"|"quality"|"delivery"|"other";
 text:string;
}
export interface ProjectGoal{
 id:string;
 projectId:string;
 title:string;
 objective:string;
 status:GoalStatus;
 priority:GoalPriority;
 requirements:GoalRequirement[];
 acceptanceCriteria:GoalAcceptanceCriterion[];
 constraints:GoalConstraint[];
 sourceTaskId?:string;
 createdAt:string;
 updatedAt:string;
 activatedAt?:string;
 completedAt?:string;
}
export interface CreateProjectGoalInput{
 projectId:string;
 title:string;
 objective:string;
 priority?:GoalPriority;
 requirements?:Array<{text:string;required?:boolean}>;
 acceptanceCriteria?:string[];
 constraints?:Array<{type:GoalConstraint["type"];text:string}>;
 sourceTaskId?:string;
}
