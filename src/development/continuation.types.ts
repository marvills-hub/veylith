export type ContinuationDecision="complete"|"continue"|"repair"|"blocked";
export interface ContinuationEvidence{
 totalWork:number;
 completedWork:number;
 failedWork:number;
 cancelledWork:number;
 blockedWork:number;
 runningWork:number;
 readyWork:number;
 pendingWork:number;
 uncoveredRequirementIds:string[];
 uncoveredAcceptanceIds:string[];
 failedWorkItemIds:string[];
 blockedWorkItemIds:string[];
 runnableWorkItemIds:string[];
}
export interface ContinuationEvaluation{
 sessionId:string;
 projectId:string;
 goalId:string;
 cycleId:string|null;
 decision:ContinuationDecision;
 reason:string;
 goalSatisfied:boolean;
 graphTerminal:boolean;
 needsAdditionalWork:boolean;
 evidence:ContinuationEvidence;
 evaluatedAt:string;
}
