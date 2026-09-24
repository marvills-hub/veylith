export type AgentRole="architect"|"planner"|"developer"|"tester"|"reviewer"|"diagnostic"|"repair"|"documentation"|"delivery";
export type AgentAssignmentStatus="assigned"|"working"|"completed"|"failed"|"cancelled";
export interface AgentRoleDefinition{
 role:AgentRole;
 name:string;
 responsibility:string;
 workKinds:string[];
}
export interface AgentAssignment{
 id:string;
 goalId:string;
 projectId:string;
 workItemId:string;
 role:AgentRole;
 status:AgentAssignmentStatus;
 ownerToken:string|null;
 handoffFromAssignmentId:string|null;
 startedAt:string|null;
 completedAt:string|null;
 createdAt:string;
 updatedAt:string;
}
