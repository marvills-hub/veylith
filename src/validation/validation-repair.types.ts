import type{DevelopmentResult}from"../orchestration/pipeline.types.js";

export type ValidationRepairStatus="pending"|"repairing"|"applied"|"failed"|"blocked";

export interface ValidationRepairAttempt{
 id:string;
 runId:string;
 diagnosticId:string;
 projectId:string;
 taskId:string|null;
 attempt:number;
 status:ValidationRepairStatus;
 fingerprint:string;
 failureKind:string;
 scope:"focused"|"expanded"|"broad";
 repair:DevelopmentResult|null;
 files:string[];
 error:string|null;
 createdAt:string;
 updatedAt:string;
 completedAt:string|null;
}

export interface ValidationRepairDecision{
 action:"repair"|"resume"|"blocked";
 reason:string;
 attempt:number;
 scope:"focused"|"expanded"|"broad";
 previous:ValidationRepairAttempt|null;
}
