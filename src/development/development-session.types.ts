export type DevelopmentSessionStatus="active"|"paused"|"completed"|"failed"|"cancelled";
export type DevelopmentMilestoneStatus="pending"|"active"|"completed"|"blocked"|"failed"|"cancelled";

export interface DevelopmentSession{
 id:string;
 projectId:string;
 goalId:string;
 status:DevelopmentSessionStatus;
 currentMilestoneId:string|null;
 progress:number;
 recoveryCount:number;
 lastCheckpointAt:string|null;
 pauseReason:string|null;
 failure:string|null;
 startedAt:string;
 pausedAt:string|null;
 resumedAt:string|null;
 completedAt:string|null;
 createdAt:string;
 updatedAt:string;
}

export interface DevelopmentMilestone{
 id:string;
 sessionId:string;
 projectId:string;
 goalId:string;
 key:string;
 title:string;
 description:string;
 sequence:number;
 status:DevelopmentMilestoneStatus;
 workItemIds:string[];
 progress:number;
 startedAt:string|null;
 completedAt:string|null;
 createdAt:string;
 updatedAt:string;
}

export interface DevelopmentSessionSnapshot{
 session:DevelopmentSession;
 milestones:DevelopmentMilestone[];
 currentMilestone:DevelopmentMilestone|null;
}
