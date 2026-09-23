async function request(url,options={}){
 const response=await fetch(url,{
  ...options,
  headers:{
   ...(options.body?{"Content-Type":"application/json"}:{}),
   ...(options.headers||{})
  }
 });
 let body=null;
 try{body=await response.json()}catch{}
 if(!response.ok)throw new Error(body?.error||`${response.status} ${response.statusText}`);
 return body;
}
export const api={
 dashboard:()=>request("/api/dashboard"),
 health:()=>request("/api/health"),
 ai:()=>request("/api/ai"),
 jobs:()=>request("/api/jobs"),
 logs:query=>request(`/api/logs${query?`?${query}`:""}`),
 logStats:()=>request("/api/logs/stats"),
 logFiles:()=>request("/api/logs/files"),
 security:()=>request("/api/security"),
 securityEvents:(limit=100)=>request(`/api/security/events?limit=${limit}`),
 sandbox:()=>request("/api/sandbox"),
 projectTeam:id=>request(`/api/projects/${encodeURIComponent(id)}/team`),
 projectPublication:id=>request(`/api/projects/${encodeURIComponent(id)}/publication`),
 createTask:(name,prompt)=>request("/api/tasks",{method:"POST",body:JSON.stringify({name,prompt})}),
 demo:()=>request("/api/demo",{method:"POST"}),
 pauseTask:(id,reason="Paused from dashboard")=>request(`/api/tasks/${id}/pause`,{method:"POST",body:JSON.stringify({reason})}),
 resumeTask:id=>request(`/api/tasks/${id}/resume`,{method:"POST"}),
 cancelTask:id=>request(`/api/tasks/${id}/cancel`,{method:"POST"}),
 priority:(id,priority)=>request(`/api/tasks/${id}/priority`,{method:"POST",body:JSON.stringify({priority})})
};

