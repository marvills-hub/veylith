export type ContinuationWorkKind=
 "architecture"|"analysis"|"implementation"|"integration"|"test"|"review"|
 "documentation"|"delivery"|"other";

export interface ContinuationWorkProposal{
 key:string;
 title:string;
 description:string;
 kind:ContinuationWorkKind;
 priority?:number;
 dependencies?:string[];
 requirementIds?:string[];
 acceptanceIds?:string[];
}

export interface GoalExpansionResult{
 goalId:string;
 projectId:string;
 addedWorkItemIds:string[];
 addedWorkKeys:string[];
 skippedWorkKeys:string[];
 totalWorkItems:number;
}
