import{db}from"./src/database/database.js";

const tables=db.prepare(`
 SELECT name,sql
 FROM sqlite_master
 WHERE type='table'
 AND (
  name LIKE '%development%' OR
  name LIKE '%validation%' OR
  name LIKE '%review%' OR
  name='goal_role_results'
 )
 ORDER BY name
`).all();

for(const table of tables){
 console.log(`\n--- ${table.name} ---`);
 console.log(table.sql);
}
