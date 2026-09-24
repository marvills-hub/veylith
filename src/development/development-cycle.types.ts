export type DevelopmentCycleStatus="active"|"evaluating"|"continued"|"completed"|"failed"|"cancelled";
export interface DevelopmentCycle{
 id:string;
 sessionId:string;
 projectId:string;
 goalId:string;
 number:number;
 status:DevelopmentCycleStatus;
 reason:string|null;
 summary:string|null;
 workItemIds:string[];
 createdAt:string;
 updatedAt:string;
 startedAt:string;
 completedAt:string|null;
}
export interface DevelopmentCycleInput{
 sessionId:string;
 projectId:string;
 goalId:string;
 workItemIds?:string[];
 reason?:string|null;
}
