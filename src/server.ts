import "dotenv/config";
import {createApp} from "./api/routes.js";
import {db} from "./database/database.js";
import {workerLoop} from "./core/worker.service.js";
import {collectMetrics} from "./monitoring/metrics.service.js";
import {event,setWorker} from "./core/telemetry.js";
import {VERSION,PORT,POLL,METRIC_INTERVAL,WORKER_ID,AI_KEY,AI_MODEL,GITHUB_ENABLED,GITHUB_OWNER,ROOT,DB_PATH} from "./config/config.js";
const app=createApp();
setWorker("online","booting");
event("system.started",`Veylith Core v${VERSION} started`,{data:{pid:process.pid,worker:WORKER_ID,aiConfigured:Boolean(AI_KEY),githubConfigured:GITHUB_ENABLED}});
setInterval(workerLoop,POLL);
setInterval(collectMetrics,METRIC_INTERVAL);
await collectMetrics();
await workerLoop();
app.listen(PORT,()=>{
 console.log("");
 console.log("==========================================");
 console.log(` VEYLITH CORE v${VERSION}`);
 console.log("==========================================");
 console.log(` Control Center : http://localhost:${PORT}`);
 console.log(` Worker         : ${WORKER_ID}`);
 console.log(` AI             : ${AI_KEY?`${AI_MODEL} READY`:"NOT CONFIGURED"}`);
 console.log(` GitHub         : ${GITHUB_ENABLED?`${GITHUB_OWNER} READY`:"NOT CONFIGURED"}`);
 console.log(` Workspace      : ${ROOT}`);
 console.log(` Database       : ${DB_PATH}`);
 console.log("==========================================");
 console.log("");
});
function shutdown(signal:string){
 try{event("system.stopped",`Veylith received ${signal}`);db.close()}catch{}
 process.exit(0);
}
process.on("SIGINT",()=>shutdown("SIGINT"));
process.on("SIGTERM",()=>shutdown("SIGTERM"));
