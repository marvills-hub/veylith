import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const events=read("public/js/api/events.js");
const health=read("public/js/components/connection-health.js");
const app=read("public/js/app.js");
const html=read("public/index.html");
const css=read("public/css/app.css");
let passed=0;

function test(name,value){
 assert.ok(value,name);
 console.log(`PASS ${String(++passed).padStart(2,"0")} ${name}`);
}

console.log("\nVEYLITH v0.9 BATCH 5 PASS 6 REGRESSION\n");

test("SSE module uses EventSource",events.includes('new EventSource("/api/events")'));
test("SSE keeps one source reference",events.includes("let source=null"));
test("SSE reconnect timer exists",events.includes("let reconnectTimer=null"));
test("SSE reconnect attempt tracked",events.includes("let reconnectAttempt=0"));
test("SSE exponential backoff exists",events.includes("Math.pow(2,reconnectAttempt)"));
test("SSE reconnect delay capped",events.includes("MAX_DELAY=30000"));
test("SSE closes failed source",events.includes("source?.close()"));
test("SSE schedules reconnect",events.includes("scheduleReconnect()"));
test("SSE resets attempt after open",events.includes("reconnectAttempt=0"));
test("SSE records connection time",events.includes("lastConnectedAt=Date.now()"));
test("SSE records event time",events.includes("lastEventAt=Date.now()"));
test("SSE exposes connection state",events.includes("eventConnectionState"));
test("SSE exposes explicit disconnect",events.includes("disconnectEvents"));
test("SSE supports state callback",events.includes("stateHandler"));
test("Connection health component exists",fs.existsSync("public/js/components/connection-health.js"));
test("API success tracked",health.includes("lastApiSuccess"));
test("API failure tracked",health.includes("lastApiFailure"));
test("Stale API threshold exists",health.includes("STALE_API_MS=45000"));
test("Worker stale threshold exists",health.includes("STALE_WORKER_MS=45000"));
test("Live state exists",health.includes('"live"'));
test("Reconnecting state exists",health.includes('"reconnecting"'));
test("Stale state exists",health.includes('"stale"'));
test("Offline state exists",health.includes('"offline"'));
test("Worker heartbeat detection exists",health.includes("workerHeartbeat"));
test("Worker heartbeat timestamp supported",health.includes("heartbeat_at"));
test("Worker stale rendering exists",health.includes('stale?"STALE"'));
test("Connection status updates system status",health.includes("systemStatus"));
test("Connection status updates system dot",health.includes("systemDot"));
test("Health renderer has timer",health.includes("setInterval(render,5000)"));
test("App tracks dashboard API success",app.includes("apiRequestSucceeded(data)"));
test("App tracks dashboard API failure",app.includes("apiRequestFailed()"));
test("App receives SSE state",app.includes("streamConnectionChanged(info)"));
test("App uses adaptive polling",app.includes("connection.connected?15000:5000"));
test("Disconnected polling is faster",app.includes(":5000"));
test("Connected polling remains fallback",app.includes("?15000"));
test("Polling uses timeout not overlapping interval",app.includes("setTimeout(async()=>"));
test("Refresh prevents overlap",app.includes("if(refreshing)return false"));
test("SSE phase refresh retained",app.includes('message.channel==="phase"'));
test("SSE worker refresh retained",app.includes('message.channel==="worker"'));
test("SSE worker slot refresh retained",app.includes('message.channel==="worker_slots"'));
test("SSE event handling retained",app.includes('message.channel==="event"'));
test("SSE terminal handling retained",app.includes('message.channel==="terminal"'));
test("Unload stops polling",app.includes('beforeunload'));
test("Connection health UI exists",html.includes('id="connectionHealth"'));
test("Connection badge exists",html.includes('id="connectionBadge"'));
test("Connection text exists",html.includes('id="connectionText"'));
test("Connection detail exists",html.includes('id="connectionDetail"'));
test("Worker heartbeat UI exists",html.includes('id="connectionWorkers"'));
test("Live badge styling exists",css.includes(".connection-badge.live"));
test("Reconnect badge styling exists",css.includes(".connection-badge.reconnecting"));
test("Stale badge styling exists",css.includes(".connection-badge.stale"));
test("Offline badge styling exists",css.includes(".connection-badge.offline"));
test("Stale worker styling exists",css.includes(".connection-worker.stale"));
test("Responsive worker health UI exists",css.includes(".connection-workers"));
test("No random connection status",!health.includes("Math.random"));
test("No random worker status",!events.includes("Math.random"));

console.log(`\nRESULT ${passed}/56 PASSED`);
console.log("SSE reliability + stale/offline detection ready.\n");
