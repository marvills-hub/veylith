import {db} from "../database/database.js";
import {executeTask,failTask} from "./task.service.js";
import {setWorker} from "./telemetry.js";
let running=false;
export async function workerLoop(){
 if(running)return;
 const task=db.prepare("SELECT * FROM tasks WHERE status='queued' ORDER BY priority DESC,created_at ASC LIMIT 1").get() as any;
 if(!task){setWorker("idle","waiting");return}
 running=true;
 try{await executeTask(task)}
 catch(error){await failTask(task,error)}
 finally{running=false;setWorker("idle","waiting")}
}
