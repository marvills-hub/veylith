export type DeliveryPublicationStatus="authorized"|"publishing"|"published"|"failed"|"invalidated";
export interface DeliveryPublication{
 id:string;
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 deliveryPlanId:string;
 commitPreparationId:string;
 readinessId:string;
 workspace:string;
 repositoryName:string;
 targetBranch:string;
 visibility:"private"|"public";
 commit:string;
 repositoryFingerprint:string;
 status:DeliveryPublicationStatus;
 github:Record<string,unknown>|null;
 error:string|null;
 metadata:Record<string,unknown>;
 createdAt:string;
 updatedAt:string;
 publishedAt:string|null;
}
export interface AuthorizeDeliveryPublicationInput{
 deliveryPlanId:string;
}
export interface ExecuteDeliveryPublicationInput{
 deliveryPlanId:string;
 task:{
  id:string;
  title:string;
  [key:string]:unknown;
 };
 project:{
  id:string;
  workspace:string;
  slug:string;
  [key:string]:unknown;
 };
}
