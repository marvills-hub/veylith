export type DeliveryVerificationStatus="pending"|"verified"|"failed"|"recovering"|"blocked";
export type DeliveryRecoveryAction="none"|"resume_publication"|"retry_publication"|"manual";
export interface DeliveryVerification{
 id:string;
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 deliveryPlanId:string;
 publicationId:string;
 expectedCommit:string;
 actualCommit:string|null;
 repositoryName:string;
 targetBranch:string;
 status:DeliveryVerificationStatus;
 verified:boolean;
 recoveryAction:DeliveryRecoveryAction;
 attempts:number;
 error:string|null;
 evidence:string[];
 metadata:Record<string,unknown>;
 createdAt:string;
 updatedAt:string;
 verifiedAt:string|null;
}
export interface VerifyDeliveryInput{
 deliveryPlanId:string;
 actualCommit:string|null;
 remoteVerified:boolean;
 evidence?:string[];
 metadata?:Record<string,unknown>;
}
export interface RecoverDeliveryInput{
 deliveryPlanId:string;
 reason?:string;
}
