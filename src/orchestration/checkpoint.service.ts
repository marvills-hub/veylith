import {db} from "../database/database.js";

function parse<T>(content:string|null|undefined):T|undefined{
 if(!content)return undefined;
 try{return JSON.parse(content) as T}catch{return undefined}
}

export function checkpoint<T=any>(projectId:string,type:string):T|undefined{
 const row=db.prepare(`
 SELECT content
 FROM project_memory
 WHERE project_id=? AND type=?
 ORDER BY id DESC
 LIMIT 1
 `).get(projectId,type) as any;
 return parse<T>(row?.content);
}

export function checkpoints<T=any>(projectId:string,prefix:string):Array<{type:string;value:T}>{
 const rows=db.prepare(`
 SELECT type,content
 FROM project_memory
 WHERE project_id=? AND type LIKE ?
 ORDER BY id ASC
 `).all(projectId,`${prefix}%`) as any[];
 return rows.map(row=>({type:row.type,value:parse<T>(row.content)})).filter(row=>row.value!==undefined) as Array<{type:string;value:T}>;
}

export function successfulRepairCount(projectId:string){
 const rows=db.prepare(`
 SELECT type
 FROM project_memory
 WHERE project_id=? AND type LIKE 'repair_%'
 `).all(projectId) as any[];
 let highest=0;
 for(const row of rows){
  const match=String(row.type).match(/^repair_(\d+)$/);
  if(match)highest=Math.max(highest,Number(match[1]));
 }
 return highest;
}

export function hasCheckpoint(projectId:string,type:string){
 return Boolean(db.prepare(`
 SELECT 1
 FROM project_memory
 WHERE project_id=? AND type=?
 LIMIT 1
 `).get(projectId,type));
}
