import {db} from "../src/database/database.js";

const projectId="prj_59e5737b2866ea25";
const taskId="tsk_067b81f72558ef83";
const recoveryId="rcv_4b781ea4a12d7e3c";

function show(title:string,sql:string,...args:any[]){
 console.log(`\n=== ${title} ===`);
 try{
  console.log(JSON.stringify(db.prepare(sql).all(...args),null,2));
 }catch(error:any){
  console.log("ERROR:",error?.message||String(error));
 }
}

show(
 "RECOVERY",
 "SELECT * FROM team_recoveries WHERE id=?",
 recoveryId
);

show(
 "PROJECT MEMORY - TEAM REPAIR",
 `SELECT *
  FROM project_memory
  WHERE project_id=?
    AND (
     type LIKE '%repair%'
     OR type LIKE '%diagnostic%'
     OR content LIKE '%repair%'
     OR content LIKE '%package.json%'
    )
  ORDER BY rowid DESC
  LIMIT 50`,
 projectId
);

show(
 "REPAIR EVENTS 7-9",
 `SELECT *
  FROM events
  WHERE task_id=?
    AND (
     type='team.recovery_started'
     OR type='team.repair_rejected'
     OR type='team.recovery_exhausted'
    )
  ORDER BY rowid DESC
  LIMIT 20`,
 taskId
);

show(
 "FAILURE HISTORY",
 `SELECT *
  FROM failure_history
  WHERE project_id=?
  ORDER BY rowid DESC
  LIMIT 50`,
 projectId
);
