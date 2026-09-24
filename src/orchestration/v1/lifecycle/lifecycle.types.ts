export type AutonomousLifecycleStatus=
 "running"|
 "waiting"|
 "delivering"|
 "completed"|
 "failed";

export type AutonomousLifecycleStage=
 "intake"|
 "planning"|
 "development"|
 "validation"|
 "review"|
 "delivery"|
 "verification"|
 "release"|
 "completed";

export interface AutonomousLifecycleCheckpoint{
 id:string;
 projectId:string;
 goalId:string;
 stage:AutonomousLifecycleStage;
 status:AutonomousLifecycleStatus;
 taskId:string|null;
 workItemId:string|null;
 deliveryPlanId:string|null;
 publicationId:string|null;
 verificationId:string|null;
 releaseId:string|null;
 error:string|null;
 metadata:Record<string,any>;
 createdAt:string;
 updatedAt:string;
 completedAt:string|null;
}
