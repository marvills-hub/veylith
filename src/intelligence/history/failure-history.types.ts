export type FailureResolutionOutcome="resolved"|"unresolved"|"regressed"|"blocked";
export interface FailureHistoryRecord{
 id:string;
 projectId:string;
 taskId:string|null;
 fingerprint:string;
 failureKind:string;
 summary:string;
 rootCause:string;
 relevantFiles:string[];
 repairFiles:string[];
 strategy:string[];
 repairAttemptId:string|null;
 verificationId:string|null;
 beforeRunId:string|null;
 afterRunId:string|null;
 snapshotId:string|null;
 evolutionEventId:string|null;
 outcome:FailureResolutionOutcome;
 evidence:string[];
 occurrences:number;
 firstSeenAt:string;
 lastSeenAt:string;
 metadata:Record<string,unknown>;
}
export interface FailureHistoryMatch{
 record:FailureHistoryRecord;
 exact:boolean;
 useful:boolean;
}
export interface FailureHistoryState{
 projectId:string;
 total:number;
 resolved:number;
 unresolved:number;
 regressed:number;
 blocked:number;
 records:FailureHistoryRecord[];
}
