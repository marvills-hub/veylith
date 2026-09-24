import {db} from "../src/database/database.js";

for(const table of["team_recoveries","failure_history"]){
 console.log(`\n${table}`);
 console.log(JSON.stringify(
  db.prepare(`PRAGMA table_info(${table})`).all(),
  null,
  2
 ));
}

console.log("\nTESTER RECOVERY:");
console.log(JSON.stringify(
 db.prepare(`
  SELECT *
  FROM team_recoveries
  WHERE task_id=?
  ORDER BY rowid DESC
 `).all("tsk_067b81f72558ef83"),
 null,
 2
));
