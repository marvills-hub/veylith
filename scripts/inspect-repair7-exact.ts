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
 "LATEST TEAM RECOVERIES",
 `SELECT *
  FROM team_recoveries
  WHERE project_id=?
  ORDER BY rowid DESC
  LIMIT 10`,
 projectId
);

show(
 "EVENTS FOR TESTER",
 `SELECT *
  FROM events
  WHERE task_id=?
  ORDER BY rowid DESC
  LIMIT 50`,
 taskId
);

show(
 "FAILURE HISTORY",
 `SELECT *
  FROM failure_history
  WHERE project_id=?
  ORDER BY rowid DESC
  LIMIT 30`,
 projectId
);

show(
 "PROJECT MEMORY",
 `SELECT *
  FROM project_memory
  WHERE project_id=?
  ORDER BY rowid DESC
  LIMIT 30`,
 projectId
);

show(
 "ROLE RESULT",
 `SELECT *
  FROM goal_role_results
  WHERE task_id=?
  ORDER BY rowid DESC
  LIMIT 10`,
 taskId
);
