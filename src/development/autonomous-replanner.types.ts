import type{AIProvider}from"../agent/providers/provider.types.js";
import type{ContinuationEvaluation}from"./continuation.types.js";
import type{ContinuationWorkProposal}from"./goal-expansion.types.js";

export interface AIContinuationPlan{
 reason:string;
 work:ContinuationWorkProposal[];
}

export interface AutonomousReplanResult{
 evaluation:ContinuationEvaluation;
 plan:AIContinuationPlan|null;
 applied:boolean;
 continuation:any|null;
}
export interface ReplanProviderOptions{
 provider?:AIProvider;
 taskId?:string;
}
