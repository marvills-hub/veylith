export type DeliveryReadinessStatus="ready"|"blocked";
export type DeliveryReadinessCheckStatus="passed"|"failed";
export type DeliveryReadinessCheckKey=
 "goal_complete"|
 "work_complete"|
 "validation_passed"|
 "review_approved"|
 "repository_available"|
 "unresolved_failures"|
 "unresolved_escalations";
export interface DeliveryReadinessCheck{
 key:DeliveryReadinessCheckKey;
 status:DeliveryReadinessCheckStatus;
 summary:string;
 evidence:string[];
}
export interface DeliveryReadinessInput{
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 workspace:string;
 goalComplete:boolean;
 totalWork:number;
 completedWork:number;
 validationPassed:boolean;
 reviewApproved:boolean;
 repositoryAvailable:boolean;
 unresolvedFailures:number;
 unresolvedEscalations:number;
 evidence?:string[];
 metadata?:Record<string,unknown>;
}
export interface DeliveryReadinessAssessment{
 id:string;
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 workspace:string;
 status:DeliveryReadinessStatus;
 ready:boolean;
 checks:DeliveryReadinessCheck[];
 blockers:string[];
 evidence:string[];
 metadata:Record<string,unknown>;
 createdAt:string;
 updatedAt:string;
}
