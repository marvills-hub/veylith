export type DeliveryCommitStatus="prepared"|"invalidated";
export interface DeliveryCommitPreparation{
 id:string;
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 deliveryPlanId:string;
 readinessId:string;
 workspace:string;
 repositoryFingerprint:string;
 commit:string;
 commitMessage:string;
 created:boolean;
 changedFiles:number;
 status:DeliveryCommitStatus;
 metadata:Record<string,unknown>;
 createdAt:string;
 updatedAt:string;
}
export interface PrepareDeliveryCommitInput{
 deliveryPlanId:string;
 task:{
  id:string;
  title:string;
  [key:string]:unknown;
 };
 project:{
  id:string;
  workspace:string;
  [key:string]:unknown;
 };
}
