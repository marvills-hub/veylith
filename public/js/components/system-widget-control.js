const POSITION_KEY="veylith-system-widget-v24-position";

function clamp(value,min,max){
 return Math.max(min,Math.min(max,value));
}

function placeDefault(widget){
 const width=94;
 const rightGap=112;
 widget.style.setProperty("left",(window.innerWidth-width-rightGap)+"px","important");
 widget.style.setProperty("top","48px","important");
 widget.style.setProperty("right","auto","important");
 widget.style.setProperty("bottom","auto","important");
}

function setPosition(widget,x,y){
 const width=widget.offsetWidth||94;
 const height=widget.offsetHeight||28;
 x=clamp(x,4,Math.max(4,window.innerWidth-width-4));
 y=clamp(y,4,Math.max(4,window.innerHeight-height-4));

 widget.style.setProperty("left",Math.round(x)+"px","important");
 widget.style.setProperty("top",Math.round(y)+"px","important");
 widget.style.setProperty("right","auto","important");
 widget.style.setProperty("bottom","auto","important");
}

function save(widget){
 const rect=widget.getBoundingClientRect();
 localStorage.setItem(POSITION_KEY,JSON.stringify({
  x:Math.round(rect.left),
  y:Math.round(rect.top)
 }));
}

function restore(widget){
 try{
  const saved=JSON.parse(localStorage.getItem(POSITION_KEY)||"null");
  if(!saved||!Number.isFinite(saved.x)||!Number.isFinite(saved.y)){
   placeDefault(widget);
   return;
  }
  setPosition(widget,saved.x,saved.y);
 }catch{
  placeDefault(widget);
 }
}

export function setupSystemWidgetControl(){
 const widget=document.querySelector(".system-widget");
 if(!widget)return;

 /* Prevent duplicate controller initialization */
 if(widget.dataset.v24==="1")return;
 widget.dataset.v24="1";

 /* Always begin collapsed */
 widget.classList.add("collapsed");

 /* Our own handle avoids conflicts with old widget controls */
 let handle=widget.querySelector(".system-widget-v24-handle");

 if(!handle){
  handle=document.createElement("div");
  handle.className="system-widget-v24-handle";
  handle.innerHTML='SYSTEM&nbsp;&nbsp;<span style="color:#45e878">●</span>';
  widget.prepend(handle);
 }

 restore(widget);

 let pointerId=null;
 let startX=0;
 let startY=0;
 let originX=0;
 let originY=0;
 let dragged=false;

 handle.addEventListener("pointerdown",event=>{
  if(event.button!==0)return;

  event.preventDefault();
  event.stopPropagation();

  const rect=widget.getBoundingClientRect();

  pointerId=event.pointerId;
  startX=event.clientX;
  startY=event.clientY;
  originX=rect.left;
  originY=rect.top;
  dragged=false;

  handle.setPointerCapture(event.pointerId);
 });

 handle.addEventListener("pointermove",event=>{
  if(pointerId!==event.pointerId)return;

  const dx=event.clientX-startX;
  const dy=event.clientY-startY;

  if(!dragged && Math.hypot(dx,dy)>=4)dragged=true;
  if(!dragged)return;

  event.preventDefault();
  event.stopPropagation();

  setPosition(widget,originX+dx,originY+dy);
 });

 function finish(event){
  if(pointerId!==event.pointerId)return;

  event.preventDefault();
  event.stopPropagation();

  try{
   handle.releasePointerCapture(event.pointerId);
  }catch{}

  pointerId=null;

  if(dragged){
   save(widget);
   dragged=false;
   return;
  }

  const rect=widget.getBoundingClientRect();

  widget.classList.toggle("collapsed");

  /* Preserve exact top-left anchor while changing size */
  requestAnimationFrame(()=>{
   setPosition(widget,rect.left,rect.top);
   save(widget);
  });
 }

 handle.addEventListener("pointerup",finish);

 handle.addEventListener("pointercancel",event=>{
  if(pointerId!==event.pointerId)return;
  pointerId=null;
  dragged=false;
 });

 window.addEventListener("resize",()=>{
  const rect=widget.getBoundingClientRect();
  setPosition(widget,rect.left,rect.top);
  save(widget);
 });
}
