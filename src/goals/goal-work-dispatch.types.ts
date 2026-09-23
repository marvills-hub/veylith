export type GoalWorkDispatchStatus="not_dispatched"|"queued"|"running"|"completed"|"failed"|"cancelled";
export interface GoalWorkDispatch{
 workItemId:string;
 goalId:string;
 projectId:string;
 taskId:string;
 jobId:string|null;
 status:GoalWorkDispatchStatus;
 createdAt:string;
 updatedAt:string;
}
