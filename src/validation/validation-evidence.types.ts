import type{ValidationStage,ValidationStrategy}from"./validation-strategy.types.js";

export type ValidationRunStatus="running"|"passed"|"failed"|"cancelled";
export type ValidationResultStatus="passed"|"failed"|"skipped"|"cancelled";
export type ValidationFailureKind=
 "build"|
 "typecheck"|
 "lint"|
 "test"|
 "dependency"|
 "timeout"|
 "infrastructure"|
 "command"|
 "unknown";

export interface ValidationRun{
 id:string;
 projectId:string;
 taskId:string|null;
 workspace:string;
 status:ValidationRunStatus;
 strategy:ValidationStrategy;
 summary:string|null;
 startedAt:string;
 completedAt:string|null;
 createdAt:string;
 updatedAt:string;
}

export interface ValidationResult{
 id:string;
 runId:string;
 commandId:string;
 stage:ValidationStage;
 command:string;
 args:string[];
 status:ValidationResultStatus;
 exitCode:number|null;
 durationMs:number|null;
 stdout:string;
 stderr:string;
 failureKind:ValidationFailureKind|null;
 fingerprint:string|null;
 createdAt:string;
 updatedAt:string;
}

export interface ValidationFailureClassification{
 kind:ValidationFailureKind;
 fingerprint:string;
 reason:string;
 retryable:boolean;
}
