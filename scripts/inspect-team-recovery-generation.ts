import {db} from "../src/database/database.js";

console.log("\n--- TEAM_RECOVERIES SCHEMA ---");
console.log(JSON.stringify(
 db.prepare("PRAGMA table_info(team_recoveries)").all(),
 null,
 2
));

console.log("\n--- TEAM_RECOVERIES INDEXES ---");
console.log(JSON.stringify(
 db.prepare("PRAGMA index_list(team_recoveries)").all(),
 null,
 2
));

const indexes=db.prepare("PRAGMA index_list(team_recoveries)").all() as any[];

for(const index of indexes){
 console.log(`\n--- INDEX ${index.name} ---`);
 console.log(JSON.stringify(
  db.prepare(`PRAGMA index_info('${String(index.name).replace(/'/g,"''")}')`).all(),
  null,
  2
 ));
}

console.log("\n--- CREATE SQL ---");
console.log(JSON.stringify(
 db.prepare(`
  SELECT sql
  FROM sqlite_master
  WHERE type='table'
   AND name='team_recoveries'
 `).get(),
 null,
 2
));

console.log("\n--- EXISTING TRIAL RECOVERY ---");
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
