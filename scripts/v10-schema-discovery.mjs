import "dotenv/config";
import{DatabaseSync}from"node:sqlite";

const path=process.env.DB_PATH||"./data/veylith.db";
const db=new DatabaseSync(path);

console.log("\n============================================================");
console.log(" VEYLITH v1.0 BATCH 7.1E - SQLITE SCHEMA DISCOVERY");
console.log("============================================================");
console.log(`Database: ${path}`);

const tables=db.prepare(`
 SELECT name,sql
 FROM sqlite_master
 WHERE type='table'
 AND(
  name LIKE '%project%' OR
  name LIKE '%goal%' OR
  name LIKE '%development%' OR
  name LIKE '%lifecycle%' OR
  name LIKE '%work%'
 )
 ORDER BY name
`).all();

for(const table of tables){
 console.log(`\n--- ${table.name} ---`);
 console.log(table.sql);

 const columns=db.prepare(`PRAGMA table_info("${table.name}")`).all();
 console.log("COLUMNS:");
 for(const column of columns){
  console.log(
   `  ${column.name} | ${column.type} | required=${column.notnull===1} | default=${column.dflt_value} | pk=${column.pk}`
  );
 }
}

db.close();

console.log("\n============================================================");
console.log(" READ-ONLY SQLITE DISCOVERY COMPLETE");
console.log(" NO ROWS INSERTED / UPDATED / DELETED");
console.log("============================================================");
