export type ValidationEscalationReason=
 "repair_budget_exhausted"|
 "unchanged_failure_loop"|
 "regression_loop"|
 "infrastructure_blocked"|
 "provider_blocked"|
 "manual_intervention";

export type ValidationEscalationStatus=
 "open"|
 "resolved";

export type ValidationEscalationSeverity=
 "blocked"|
 "terminal";

export interface ValidationEscalation{
 id:string;
 projectId:string;
 taskId:string|null;
 runId:string|null;
 repairAttemptId:string|null;
 reason:ValidationEscalationReason;
 severity:ValidationEscalationSeverity;
 status:ValidationEscalationStatus;
 fingerprint:string|null;
 repairAttempts:number;
 unchangedFailures:number;
 regressions:number;
 summary:string;
 metadata:Record<string,unknown>;
 createdAt:string;
 updatedAt:string;
 resolvedAt:string|null;
}

export type EscalationDecisionAction=
 "continue"|
 "blocked"|
 "escalate";

export interface EscalationDecision{
 action:EscalationDecisionAction;
 reason:ValidationEscalationReason|null;
 severity:ValidationEscalationSeverity|null;
 repairAttempts:number;
 unchangedFailures:number;
 regressions:number;
 summary:string;
}
