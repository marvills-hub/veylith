import type{DiagnosticResult}from"../agent/diagnostic.service.js";

export type ValidationDiagnosticStatus="pending"|"diagnosing"|"diagnosed"|"reused"|"blocked";

export interface ValidationDiagnostic{
 id:string;
 runId:string;
 projectId:string;
 taskId:string|null;
 status:ValidationDiagnosticStatus;
 fingerprint:string;
 failureKind:string;
 repeatedCount:number;
 diagnostic:DiagnosticResult|null;
 error:string|null;
 createdAt:string;
 updatedAt:string;
 completedAt:string|null;
}

export interface DiagnosticDecision{
 action:"diagnose"|"reuse"|"blocked";
 fingerprint:string;
 failureKind:string;
 repeatedCount:number;
 retryable:boolean;
 reason:string;
 previous:ValidationDiagnostic|null;
}
