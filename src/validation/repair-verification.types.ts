export type RepairVerificationStatus="pending"|"verified"|"regressed"|"failed";

export interface RepairVerification{
 id:string;
 repairAttemptId:string;
 projectId:string;
 taskId:string|null;
 beforeRunId:string;
 afterRunId:string;
 status:RepairVerificationStatus;
 originalFingerprint:string;
 originalResolved:boolean;
 regressionFree:boolean;
 regressions:string[];
 beforePassing:string[];
 afterPassing:string[];
 afterFailures:string[];
 summary:string|null;
 createdAt:string;
 updatedAt:string;
 completedAt:string|null;
}

export interface RepairVerificationAnalysis{
 originalResolved:boolean;
 regressionFree:boolean;
 regressions:string[];
 beforePassing:string[];
 afterPassing:string[];
 afterFailures:string[];
}
