import {db} from "../src/database/database.js";

const ids={
 project:"prj_59e5737b2866ea25",
 goal:"gol_c258fc809510a809",
 recovery:"rcv_4b781ea4a12d7e3c",
 job:"job_ef6fd5f994644d1e",
 task:"tsk_067b81f72558ef83",
 work:"wrk_5de86314600ffcf5",
 assignment:"asg_12332071d557b2ec"
};

const tables=(db.prepare(`
 SELECT name
 FROM sqlite_master
 WHERE type='table'
   AND name NOT LIKE 'sqlite_%'
 ORDER BY name
`).all() as any[]).map(x=>String(x.name));

function columns(table:string){
 try{
  return (db.prepare(`PRAGMA table_info("${table}")`).all() as any[])
   .map(x=>String(x.name));
 }catch{
  return [];
 }
}

function rows(table:string,where:string,args:any[]){
 try{
  return db.prepare(
   `SELECT * FROM "${table}" WHERE ${where}`
  ).all(...args);
 }catch{
  return [];
 }
}

console.log("\n--- DATABASE TABLES ---");
for(const table of tables){
 console.log(`${table}: ${columns(table).join(", ")}`);
}

console.log("\n--- FIND EACH KNOWN ID ---");

for(const [label,id] of Object.entries(ids)){
 console.log(`\n### ${label.toUpperCase()} ${id}`);
 let found=0;

 for(const table of tables){
  const cols=columns(table);

  for(const col of cols){
   if(
    col==="id"||
    col.endsWith("_id")||
    col==="task_id"||
    col==="goal_id"||
    col==="project_id"||
    col==="work_item_id"||
    col==="assignment_id"
   ){
    const result=rows(
     table,
     `"${col}"=?`,
     [id]
    );

    if(result.length){
     found+=result.length;
     console.log(
      `TABLE=${table} COLUMN=${col}`
     );
     console.log(
      JSON.stringify(result,null,2)
     );
    }
   }
  }
 }

 if(!found){
  console.log("NOT FOUND");
 }
}

console.log("\n--- TARGET TABLE SNAPSHOTS ---");

const targets=[
 "projects",
 "team_recoveries",
 "jobs",
 "tasks",
 "goal_work_items",
 "agent_assignments",
 "autonomous_lifecycle_checkpoints",
 "development_sessions"
];

for(const table of targets){
 if(!tables.includes(table)){
  console.log(`\n### ${table}: NOT PRESENT`);
  continue;
 }

 const cols=columns(table);

 let result:any[]=[];

 if(cols.includes("project_id")){
  result=rows(
   table,
   `"project_id"=?`,
   [ids.project]
  );
 }else if(
  table==="projects"&&
  cols.includes("id")
 ){
  result=rows(
   table,
   `"id"=?`,
   [ids.project]
  );
 }else if(
  cols.includes("goal_id")
 ){
  result=rows(
   table,
   `"goal_id"=?`,
   [ids.goal]
  );
 }else if(
  cols.includes("task_id")
 ){
  result=rows(
   table,
   `"task_id"=?`,
   [ids.task]
  );
 }else if(
  cols.includes("work_item_id")
 ){
  result=rows(
   table,
   `"work_item_id"=?`,
   [ids.work]
  );
 }

 console.log(`\n### ${table}`);
 console.log(JSON.stringify(result,null,2));
}

console.log("\n--- GOAL-LIKE TABLES ---");

for(const table of tables){
 const cols=columns(table);

 if(
  table.toLowerCase().includes("goal")||
  cols.includes("goal_id")
 ){
  console.log(`\n### ${table}`);
  console.log(`COLUMNS: ${cols.join(", ")}`);

  if(cols.includes("id")){
   const byId=rows(
    table,
    `"id"=?`,
    [ids.goal]
   );

   if(byId.length){
    console.log("GOAL ID MATCH:");
    console.log(JSON.stringify(byId,null,2));
   }
  }

  if(cols.includes("goal_id")){
   const byGoal=rows(
    table,
    `"goal_id"=?`,
    [ids.goal]
   );

   if(byGoal.length){
    console.log("GOAL_ID MATCH:");
    console.log(JSON.stringify(byGoal,null,2));
   }
  }
 }
}

console.log("\n============================================================");
console.log("7.4K.1B DISCOVERY COMPLETE");
console.log("Database modified:       NO");
console.log("Workspace modified:      NO");
console.log("Recovery extended:       NO");
console.log("AI calls:                NONE");
console.log("GitHub calls:            NONE");
console.log("Runtime:                 STOPPED");
console.log("============================================================");
