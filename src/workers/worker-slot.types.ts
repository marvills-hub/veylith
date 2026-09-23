export type WorkerSlotStatus="idle"|"busy"|"stopping";
export interface WorkerSlot{
 id:string;
 slot:number;
 status:WorkerSlotStatus;
 phase:string;
 job_id:string|null;
 task_id:string|null;
 project_id:string|null;
 started_at:string;
 heartbeat_at:string;
}
