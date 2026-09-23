import {db} from "../database/database.js";
import {cancelTaskSandboxes} from "../sandbox/sandbox-manager.service.js";

export class TaskControlError extends Error{
 constructor(public action:"cancel"|"pause",message:string){
  super(message);
  this.name="TaskControlError";
 }
}

export async function enforceTaskControl(taskId:string){
 const task=db.prepare("SELECT status FROM tasks WHERE id=?").get(taskId) as any;
 if(!task)throw new TaskControlError("cancel","Task no longer exists.");
 if(task.status==="cancelled"){
  await cancelTaskSandboxes(taskId,"cancel");
  throw new TaskControlError("cancel","Task cancelled.");
 }
 if(task.status==="paused"){
  await cancelTaskSandboxes(taskId,"pause");
  throw new TaskControlError("pause","Task paused.");
 }
}

export function assertTaskRunnable(taskId:string){
 const task=db.prepare("SELECT status FROM tasks WHERE id=?").get(taskId) as any;
 if(!task)throw new TaskControlError("cancel","Task no longer exists.");
 if(task.status==="cancelled")throw new TaskControlError("cancel","Task cancelled.");
 if(task.status==="paused")throw new TaskControlError("pause","Task paused.");
}

export function taskControlState(taskId:string){
 const task=db.prepare("SELECT status,phase FROM tasks WHERE id=?").get(taskId) as any;
 return task||null;
}
