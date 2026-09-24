import {db} from "../src/database/database.js";

const projectId="prj_59e5737b2866ea25";
const taskId="tsk_067b81f72558ef83";
const recoveryId="rcv_4b781ea4a12d7e3c";

function one(sql:string,...args:any[]){
 return db.prepare(sql).get(...args);
}
function many(sql:string,...args:any[]){
 return db.prepare(sql).all(...args);
}

console.log("\nRECOVERY");
console.log(JSON.stringify(
 one("SELECT * FROM team_recoveries WHERE id=?",recoveryId),
 null,2
));

console.log("\nTESTER TASK");
console.log(JSON.stringify(
 one("SELECT * FROM tasks WHERE id=?",taskId),
 null,2
));

console.log("\nTESTER JOB");
console.log(JSON.stringify(
 one(`
  SELECT * FROM jobs
  WHERE task_id=?
  ORDER BY rowid DESC
  LIMIT 1
 `,taskId),
 null,2
));

console.log("\nLATEST REPAIR EVENTS");
console.log(JSON.stringify(
 many(`
  SELECT *
  FROM events
  WHERE task_id=?
    AND (
     type LIKE '%repair%'
     OR type LIKE '%recovery%'
    )
  ORDER BY rowid DESC
  LIMIT 30
 `,taskId),
 null,2
));

console.log("\nGOAL WORK SUMMARY");
console.log(JSON.stringify(
 many(`
  SELECT kind,status,COUNT(*) count
  FROM goal_work_items
  WHERE goal_id=(
   SELECT goal_id
   FROM team_recoveries
   WHERE id=?
  )
  GROUP BY kind,status
  ORDER BY kind,status
 `,recoveryId),
 null,2
));

console.log("\nPROJECT");
console.log(JSON.stringify(
 one("SELECT * FROM projects WHERE id=?",projectId),
 null,2
));
