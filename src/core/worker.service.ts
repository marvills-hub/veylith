import {dispatchWorkerPool} from "../workers/worker-pool.service.js";
export async function workerLoop(){
 return dispatchWorkerPool();
}
