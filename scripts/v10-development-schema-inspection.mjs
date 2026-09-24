import{db}from"./dist/database/database.js";

for(const table of[
 "development_sessions",
 "development_milestones",
 "development_cycles"
]){
 console.log(`\n=== ${table.toUpperCase()} ===`);
 const columns=db.prepare(`PRAGMA table_info(${table})`).all();
 for(const column of columns){
  console.log(
   `${column.name} | ${column.type} | notnull=${column.notnull} | default=${column.dflt_value} | pk=${column.pk}`
  );
 }
}
