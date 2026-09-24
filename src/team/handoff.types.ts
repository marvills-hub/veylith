export type AgentHandoffStatus="draft"|"delivered"|"consumed"|"cancelled";
export interface AgentHandoffArtifact{
 path:string;
 type:"file"|"directory"|"commit"|"report"|"test"|"other";
 description:string;
}
export interface AgentHandoffEvidence{
 type:"decision"|"validation"|"diagnostic"|"requirement"|"review"|"other";
 summary:string;
 reference:string|null;
}
export interface AgentHandoff{
 id:string;
 goalId:string;
 projectId:string;
 fromAssignmentId:string;
 toAssignmentId:string|null;
 fromWorkItemId:string;
 toWorkItemId:string|null;
 status:AgentHandoffStatus;
 summary:string;
 decisions:string[];
 artifacts:AgentHandoffArtifact[];
 evidence:AgentHandoffEvidence[];
 risks:string[];
 recommendations:string[];
 metadata:Record<string,unknown>;
 deliveredAt:string|null;
 consumedAt:string|null;
 createdAt:string;
 updatedAt:string;
}
