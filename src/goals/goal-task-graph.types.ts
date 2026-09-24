export type GoalWorkStatus="pending"|"ready"|"running"|"blocked"|"completed"|"failed"|"cancelled";
export type GoalWorkKind="analysis"|"architecture"|"implementation"|"test"|"review"|"documentation"|"integration"|"delivery"|"other";
export interface GoalWorkItem{
 id:string;
 goalId:string;
 projectId:string;
 key:string;
 title:string;
 description:string;
 kind:GoalWorkKind;
 status:GoalWorkStatus;
 priority:number;
 dependencies:string[];
 requirementIds:string[];
 acceptanceCriterionIds:string[];
 createdAt:string;
 updatedAt:string;
 startedAt?:string;
 completedAt?:string;
}
export interface GoalTaskGraph{
 goalId:string;
 projectId:string;
 items:GoalWorkItem[];
 roots:string[];
 leaves:string[];
 executionOrder:string[];
 createdAt:string;
 updatedAt:string;
}
export interface ProposedGoalWorkItem{
 key:string;
 title:string;
 description:string;
 kind:GoalWorkKind;
 priority?:number;
 dependencies?:string[];
 requirementIds?:string[];
 acceptanceCriterionIds?:string[];
}
export interface ProposedGoalTaskGraph{
 items:ProposedGoalWorkItem[];
}


