import si from "systeminformation";
import {db} from "../database/database.js";
import {broadcast} from "../core/telemetry.js";
import {now} from "../config/config.js";
export async function collectMetrics(){
 try{
  const[load,mem]=await Promise.all([si.currentLoad(),si.mem()]);
  const counts=db.prepare(`SELECT SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) active,SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) queued,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed FROM tasks`).get() as any;
  const metric={cpu:Number(load.currentLoad.toFixed(2)),memory:Number(((mem.active/mem.total)*100).toFixed(2)),memory_used:mem.active,memory_total:mem.total,active_tasks:counts.active||0,queued_tasks:counts.queued||0,completed_tasks:counts.completed||0,failed_tasks:counts.failed||0,uptime:Math.floor(process.uptime()),created_at:now()};
  db.prepare("INSERT INTO metrics(cpu,memory,memory_used,memory_total,active_tasks,queued_tasks,completed_tasks,failed_tasks,uptime,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(metric.cpu,metric.memory,metric.memory_used,metric.memory_total,metric.active_tasks,metric.queued_tasks,metric.completed_tasks,metric.failed_tasks,metric.uptime,metric.created_at);
  db.prepare("DELETE FROM metrics WHERE id NOT IN (SELECT id FROM metrics ORDER BY id DESC LIMIT 5000)").run();
  broadcast("metric",metric);
 }catch(error){console.error("Metrics:",error)}
}
