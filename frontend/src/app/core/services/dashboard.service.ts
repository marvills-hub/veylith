import {Injectable,signal} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {DashboardData,VeylithEvent} from '../models/dashboard.model';

@Injectable({providedIn:'root'})
export class DashboardService{
 readonly data=signal<DashboardData>({});
 readonly runtimeEvents=signal<VeylithEvent[]>([]);
 readonly loading=signal(true);
 readonly connected=signal(false);
 readonly streamConnected=signal(false);
 readonly error=signal<string|null>(null);

 private source?:EventSource;
 private poll?:number;
 private reconnect?:number;
 private runtimeKeys=new Set<string>();

 constructor(private http:HttpClient){}

 async start(){
  await this.refresh();
  this.connectEvents();

  this.poll=window.setInterval(
   ()=>void this.refresh(false),
   15000
  );
 }

 async refresh(showLoading=true){
  if(showLoading)this.loading.set(true);

  try{
   const data=await firstValueFrom(
    this.http.get<DashboardData>('/api/dashboard')
   );

   this.data.set(data||{});
   this.connected.set(true);
   this.error.set(null);

   for(const event of data?.events||[]){
    this.pushRuntime(
     this.normalize(event)
    );
   }
  }catch(error){
   this.connected.set(false);
   this.error.set(
    error instanceof Error
     ?error.message
     :'Dashboard unavailable'
   );
  }finally{
   this.loading.set(false);
  }
 }

 private connectEvents(){
  this.source?.close();

  if(this.reconnect){
   clearTimeout(this.reconnect);
   this.reconnect=undefined;
  }

  const source=new EventSource('/api/events');
  this.source=source;

  source.onopen=()=>{
   this.streamConnected.set(true);
   this.connected.set(true);

   this.pushRuntime({
    type:'system.activity',
    channel:'system',
    message:'[SYSTEM] Live event stream connected',
    createdAt:new Date().toISOString()
   });
  };

  source.onerror=()=>{
   this.streamConnected.set(false);

   if(this.source!==source)return;

   source.close();

   this.reconnect=window.setTimeout(
    ()=>this.connectEvents(),
    3000
   );
  };

  source.onmessage=(event:MessageEvent)=>{
   this.consume(event.data,'event');
  };

  const channels=[
   'event',
   'terminal',
   'runtime',
   'system',
   'worker',
   'worker_slots',
   'online',
   'busy',
   'recovery',
   'phase',
   'task',
   'job',
   'metric',
   'project',
   'development',
   'ai',
   'git',
   'github',
   'publication',
   'release',
   'validation',
   'review',
   'repair'
  ];

  for(const channel of channels){
   source.addEventListener(
    channel,
    (event:MessageEvent)=>
     this.consume(event.data,channel)
   );
  }
 }

 private consume(raw:string,sourceChannel:string){
  let parsed:any;

  try{
   parsed=JSON.parse(raw);
  }catch{
   parsed={
    message:String(raw||''),
    type:`${sourceChannel}.activity`
   };
  }

  const nested=
   parsed?.event&&typeof parsed.event==='object'
    ?parsed.event
    :parsed?.data&&typeof parsed.data==='object'
     ?parsed.data
     :parsed?.payload&&
      typeof parsed.payload==='object'&&
      (
       parsed.payload.type||
       parsed.payload.message||
       parsed.payload.text||
       parsed.payload.action||
       parsed.payload.status
      )
      ?parsed.payload
      :parsed;

  const channel=String(
   nested?.channel||
   parsed?.channel||
   sourceChannel||
   this.channelFromType(
    nested?.type||parsed?.type
   )||
   'event'
  );

  const action=String(
   nested?.action||
   nested?.status||
   nested?.state||
   'activity'
  );

  const type=String(
   nested?.type||
   parsed?.type||
   `${channel}.${action}`
  );

  const incoming:VeylithEvent={
   ...parsed,
   ...nested,
   channel,
   type,
   message:this.message(
    nested,
    parsed,
    type
   ),
   createdAt:String(
    nested?.createdAt||
    nested?.created_at||
    nested?.timestamp||
    parsed?.createdAt||
    parsed?.created_at||
    parsed?.timestamp||
    new Date().toISOString()
   )
  };

  if(channel!=='metric'){
   this.pushRuntime(incoming);

   this.data.update(current=>({
    ...current,
    events:[
     ...(current.events||[]),
     incoming
    ].slice(-300)
   }));
  }

  if([
   'worker',
   'worker_slots',
   'phase',
   'task',
   'job',
   'project',
   'development',
   'git',
   'github',
   'publication',
   'release',
   'validation',
   'review',
   'repair'
  ].includes(channel)){
   void this.refresh(false);
  }
 }

 private normalize(
  event:VeylithEvent
 ):VeylithEvent{
  const type=String(
   event.type||
   event.channel||
   'event.activity'
  );

  return {
   ...event,
   type,
   channel:String(
    event.channel||
    this.channelFromType(type)
   ),
   message:String(
    event.message||
    event.text||
    type
   )
  };
 }

 private pushRuntime(event:VeylithEvent){
  if(!this.isRuntime(event))return;

  const key=[
   event.id||'',
   event.createdAt||
   event.created_at||
   event.timestamp||
   '',
   event.type||'',
   event.channel||'',
   event.message||
   event.text||
   ''
  ].join('|');

  if(this.runtimeKeys.has(key))return;

  this.runtimeKeys.add(key);

  if(this.runtimeKeys.size>600){
   const keys=[...this.runtimeKeys];
   this.runtimeKeys=new Set(
    keys.slice(-400)
   );
  }

  this.runtimeEvents.update(current=>
   [...current,event].slice(-220)
  );
 }

 private isRuntime(event:VeylithEvent){
  const type=String(
   event.type||''
  ).toLowerCase();

  const channel=String(
   event.channel||''
  ).toLowerCase();

  if(channel==='metric')return false;

  const families=[
   'system',
   'runtime',
   'terminal',
   'event',
   'worker',
   'worker_slots',
   'online',
   'busy',
   'recovery',
   'task',
   'job',
   'phase',
   'project',
   'development',
   'ai',
   'git',
   'github',
   'publication',
   'release',
   'validation',
   'review',
   'repair'
  ];

  return families.some(value=>
   channel===value||
   type===value||
   type.startsWith(`${value}.`)||
   type.startsWith(`${value}_`)
  );
 }

 private channelFromType(value:unknown){
  const type=String(value||'event');

  return type.includes('.')
   ?type.split('.')[0]
   :type;
 }

 private message(
  source:any,
  parsed:any,
  type:string
 ){
  const direct=
   source?.message||
   source?.text||
   source?.description||
   parsed?.message||
   parsed?.text||
   parsed?.description;

  if(direct)return String(direct);

  const id=
   source?.jobId||
   source?.job_id||
   source?.taskId||
   source?.task_id||
   source?.projectId||
   source?.project_id||
   source?.workerId||
   source?.worker_id||
   source?.id;

  return id
   ?`${type} · ${id}`
   :type;
 }

 destroy(){
  this.source?.close();

  if(this.poll){
   clearInterval(this.poll);
  }

  if(this.reconnect){
   clearTimeout(this.reconnect);
  }
 }
}
