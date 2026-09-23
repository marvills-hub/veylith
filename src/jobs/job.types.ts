export type JobStatus="queued"|"running"|"paused"|"retry_wait"|"completed"|"failed"|"cancelled";
export type JobType="task";
export interface JobRecord{
 id:string;
 type:JobType;
 task_id:string;
 project_id:string;
 status:JobStatus;
 priority:number;
 attempts:number;
 max_attempts:number;
 available_at:string;
 claimed_by:string|null;
 claimed_at:string|null;
 lease_expires_at:string|null;
 heartbeat_at:string|null;
 last_error:string|null;
 created_at:string;
 updated_at:string;
 completed_at:string|null;
}
export interface QueueStats{
 total:number;
 queued:number;
 running:number;
 paused:number;
 retry_wait:number;
 completed:number;
 failed:number;
 cancelled:number;
 scheduled:number;
}
