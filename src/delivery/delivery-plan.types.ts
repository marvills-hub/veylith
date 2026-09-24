export type DeliveryPlanStatus="planned"|"cancelled"|"delivered";
export type DeliveryStage=
 "prepare"|
 "commit"|
 "repository"|
 "push"|
 "verify";
export interface DeliveryPlanStage{
 key:DeliveryStage;
 sequence:number;
 required:boolean;
 description:string;
}
export interface DeliveryReleaseManifest{
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 readinessId:string;
 workspace:string;
 repositoryFingerprint:string;
 repositoryFiles:string[];
 targetBranch:string;
 repositoryName:string;
 visibility:"private"|"public";
 stages:DeliveryPlanStage[];
 evidence:string[];
 metadata:Record<string,unknown>;
 generatedAt:string;
}
export interface DeliveryPlan{
 id:string;
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 readinessId:string;
 status:DeliveryPlanStatus;
 manifest:DeliveryReleaseManifest;
 createdAt:string;
 updatedAt:string;
 deliveredAt:string|null;
}
export interface CreateDeliveryPlanInput{
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 readinessId:string;
 workspace:string;
 repositoryName:string;
 targetBranch?:string;
 visibility?:"private"|"public";
 evidence?:string[];
 metadata?:Record<string,unknown>;
}
