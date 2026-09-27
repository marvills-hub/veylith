let source=null;
let reconnectTimer=null;
let reconnectAttempt=0;
let handler=null;
let stateHandler=null;
let state="offline";
let lastConnectedAt=0;
let lastEventAt=0;
let intentionallyClosed=false;
const MAX_DELAY=30000;

function emitState(next,detail={}){
 state=next;
 stateHandler?.({
  state,
  reconnectAttempt,
  lastConnectedAt,
  lastEventAt,
  ...detail
 });
}

function delay(){
 return Math.min(1000*Math.pow(2,reconnectAttempt),MAX_DELAY);
}

function scheduleReconnect(){
 if(intentionallyClosed||reconnectTimer)return;
 const wait=delay();
 reconnectAttempt++;
 emitState("reconnecting",{retryIn:wait});
 reconnectTimer=setTimeout(()=>{
  reconnectTimer=null;
  open();
 },wait);
}

function parse(event){
 try{return JSON.parse(event.data)}
 catch{return{channel:"message",payload:event.data}}
}

function open(){
 if(intentionallyClosed)return;
 if(source){
  source.close();
  source=null;
 }

 emitState(reconnectAttempt?"reconnecting":"connecting");

 try{
  source=new EventSource("/api/events");

  source.onopen=()=>{
   reconnectAttempt=0;
   lastConnectedAt=Date.now();
   lastEventAt=Date.now();
   emitState("live");
  };

  source.onmessage=event=>{
   lastEventAt=Date.now();
   if(state!=="live")emitState("live");
   handler?.(parse(event));
  };

  source.onerror=()=>{
   source?.close();
   source=null;
   scheduleReconnect();
  };
 }catch{
  source=null;
  scheduleReconnect();
 }
}

export function connectEvents(onMessage,onState){
 handler=onMessage;
 stateHandler=onState||null;
 intentionallyClosed=false;
 if(!source&&!reconnectTimer)open();

 return()=>{
  intentionallyClosed=true;
  if(reconnectTimer){
   clearTimeout(reconnectTimer);
   reconnectTimer=null;
  }
  source?.close();
  source=null;
  emitState("offline");
 };
}

export function eventConnectionState(){
 return{
  state,
  reconnectAttempt,
  lastConnectedAt,
  lastEventAt,
  connected:state==="live"
 };
}

export function disconnectEvents(){
 intentionallyClosed=true;
 if(reconnectTimer){
  clearTimeout(reconnectTimer);
  reconnectTimer=null;
 }
 source?.close();
 source=null;
 emitState("offline");
}
