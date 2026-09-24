import {db} from "../src/database/database.js";

const projectId="prj_59e5737b2866ea25";

const rows=db.prepare(`
 SELECT id,type,content
 FROM project_memory
 WHERE project_id=?
 ORDER BY rowid ASC
`).all(projectId) as any[];

for(const row of rows){
 const text=String(row.content||"");
 if(
  row.type.includes("plan")||
  row.type.includes("diagnostic")||
  row.type.includes("repair")||
  text.includes("tests/tasks.test.js")||
  text.includes("package.json")
 ){
  console.log("\n------------------------------------------------------------");
  console.log("ID:",row.id);
  console.log("TYPE:",row.type);
  console.log("CONTENT:");
  console.log(text);
 }
}
