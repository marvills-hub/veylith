export const $=id=>document.getElementById(id);
export const escapeHtml=value=>{
 const el=document.createElement("div");
 el.textContent=value??"";
 return el.innerHTML;
};
export const formatTime=value=>value?new Date(value).toLocaleTimeString():"—";
export const duration=seconds=>{
 const s=Math.max(0,Number(seconds)||0);
 const h=Math.floor(s/3600);
 const m=Math.floor(s%3600/60);
 const x=Math.floor(s%60);
 return`${h?`${h}h `:""}${m?`${m}m `:""}${x}s`;
};
export const statusClass=value=>String(value||"unknown").toLowerCase().replace(/[^a-z0-9_-]/g,"-");
export const number=value=>Number(value)||0;
