import {$} from "../core/utils.js";
import {api} from "../api/client.js";
export function setupTaskModal(refresh){
 const modal=$("modal");
 $("newTask").onclick=()=>{
  modal.classList.add("open");
  $("name").focus();
 };
 $("cancel").onclick=()=>modal.classList.remove("open");
 $("taskForm").onsubmit=async event=>{
  event.preventDefault();
  const submit=$("submitTask");
  submit.disabled=true;
  submit.textContent="QUEUING...";
  try{
   await api.createTask($("name").value,$("prompt").value);
   $("taskForm").reset();
   modal.classList.remove("open");
   await refresh();
  }catch(error){
   alert(error.message);
  }finally{
   submit.disabled=false;
   submit.textContent="QUEUE TASK";
  }
 };
 $("demo").onclick=async()=>{
  try{
   await api.demo();
   $("terminal").textContent="Autonomous demo task queued...\n";
   await refresh();
  }catch(error){alert(error.message)}
 };
 modal.onclick=event=>{
  if(event.target===modal)modal.classList.remove("open");
 };
}
