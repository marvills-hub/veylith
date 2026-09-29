import {db} from "../database/database.js";
import {now} from "../config/config.js";
import {event} from "../core/telemetry.js";

db.exec(`
CREATE TABLE IF NOT EXISTS veylith_focus(
 id INTEGER PRIMARY KEY CHECK(id=1),
 project_id TEXT,
 selected_at TEXT,
 updated_at TEXT NOT NULL
);
`);

db.prepare(`
 INSERT OR IGNORE INTO veylith_focus(id,project_id,selected_at,updated_at)
 VALUES(1,NULL,NULL,?)
`).run(now());

export type VeylithFocus={
 projectId:string|null;
 selectedAt:string|null;
 updatedAt:string;
 project:any|null;
};

export function getVeylithFocus():VeylithFocus{
 const row=db.prepare("SELECT * FROM veylith_focus WHERE id=1").get() as any;
 const project=row?.project_id
  ?db.prepare("SELECT * FROM projects WHERE id=?").get(row.project_id) as any
  :null;
 if(row?.project_id&&!project){
  const time=now();
  db.prepare("UPDATE veylith_focus SET project_id=NULL,selected_at=NULL,updated_at=? WHERE id=1").run(time);
  return{projectId:null,selectedAt:null,updatedAt:time,project:null};
 }
 return{
  projectId:row?.project_id?String(row.project_id):null,
  selectedAt:row?.selected_at?String(row.selected_at):null,
  updatedAt:String(row?.updated_at||now()),
  project:project||null
 };
}

export function focusProject(projectId:string,source="user"){
 const project=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId) as any;
 if(!project)throw new Error("Project not found.");
 if(["failed","cancelled"].includes(String(project.status))){
  throw new Error(`Cannot focus a ${project.status} project.`);
 }
 const previous=getVeylithFocus();
 const time=now();
 db.prepare(`
  UPDATE veylith_focus
  SET project_id=?,selected_at=?,updated_at=?
  WHERE id=1
 `).run(projectId,time,time);
 event("focus.project_selected",`${project.name} is now Veylith's focused project`,{
  projectId,
  component:"focus-controller",
  data:{source,previousProjectId:previous.projectId}
 });
 return getVeylithFocus();
}

export function clearProjectFocus(source="user"){
 const previous=getVeylithFocus();
 const time=now();
 db.prepare(`
  UPDATE veylith_focus
  SET project_id=NULL,selected_at=NULL,updated_at=?
  WHERE id=1
 `).run(time);
 if(previous.projectId){
  event("focus.project_cleared","Veylith project focus cleared",{
   projectId:previous.projectId,
   component:"focus-controller",
   data:{source}
  });
 }
 return getVeylithFocus();
}

export function focusedProjectId(){
 return getVeylithFocus().projectId;
}
