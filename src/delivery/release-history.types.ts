export type ReleaseStatus="released"|"superseded";
export interface ProjectRelease{
 id:string;
 projectId:string;
 taskId:string|null;
 goalId:string|null;
 deliveryPlanId:string;
 publicationId:string;
 verificationId:string;
 repositoryName:string;
 targetBranch:string;
 commit:string;
 repositoryFingerprint:string;
 previousReleaseId:string|null;
 previousCommit:string|null;
 sequence:number;
 status:ReleaseStatus;
 manifest:Record<string,unknown>;
 evidence:string[];
 metadata:Record<string,unknown>;
 releasedAt:string;
 createdAt:string;
 updatedAt:string;
}
export interface RecordVerifiedReleaseInput{
 deliveryPlanId:string;
 metadata?:Record<string,unknown>;
}
