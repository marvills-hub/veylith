export type GitPublicationStage="none"|"committed"|"repository_ready"|"pushed"|"verified";
export type GitPublicationState={
 projectId:string;
 stage:GitPublicationStage;
 commit:string|null;
 branch:string|null;
 owner:string|null;
 repository:string|null;
 repositoryUrl:string|null;
 remoteUrl:string|null;
 committedAt:string|null;
 repositoryReadyAt:string|null;
 pushedAt:string|null;
 verifiedAt:string|null;
 updatedAt:string;
};
export type GitRepositoryState={
 workspace:string;
 initialized:boolean;
 branch:string|null;
 head:string|null;
 dirty:boolean;
 changedFiles:number;
 origin:string|null;
};
export type GitHubFailureKind="transient"|"authentication"|"permission"|"not_found"|"conflict"|"validation"|"unknown";
export type GitHubFailure={
 kind:GitHubFailureKind;
 retryable:boolean;
 status:number|null;
 message:string;
};
