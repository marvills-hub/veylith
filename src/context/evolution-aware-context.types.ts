import type{RepositoryEvolutionState}from"../evolution/repository-evolution.types.js";
import type{ProjectKnowledge}from"../knowledge/project-knowledge.types.js";
import type{RepositoryConvention}from"../conventions/repository-convention.types.js";
import type{FailureHistoryRecord}from"../intelligence/history/failure-history.types.js";

export type EvolutionContextRole=
 "architect"|
 "planner"|
 "developer"|
 "tester"|
 "reviewer"|
 "diagnostic"|
 "repair"|
 "documentation"|
 "delivery";

export interface EvolutionAwareContext{
 projectId:string;
 role:EvolutionContextRole;
 repositoryEvolution:RepositoryEvolutionState;
 activeKnowledge:ProjectKnowledge[];
 conventions:RepositoryConvention[];
 failureHistory:FailureHistoryRecord[];
 prompt:string;
 generatedAt:string;
}
