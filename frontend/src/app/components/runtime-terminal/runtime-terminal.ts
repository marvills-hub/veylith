import {
 AfterViewChecked,
 ChangeDetectionStrategy,
 Component,
 ElementRef,
 ViewChild,
 computed,
 input
} from '@angular/core';
import {VeylithEvent} from '../../core/models/dashboard.model';

@Component({
 selector:'app-runtime-terminal',
 standalone:true,
 templateUrl:'./runtime-terminal.html',
 styleUrl:'./runtime-terminal.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class RuntimeTerminalComponent
 implements AfterViewChecked{

 events=input<VeylithEvent[]>([]);
 live=input(false);

 @ViewChild('feedEl')
 feedElement?:ElementRef<HTMLDivElement>;

 runtimeRows=computed(()=>
  this.events().slice(-100)
 );

 ngAfterViewChecked(){
  const element=
   this.feedElement?.nativeElement;

  if(!element)return;

  element.scrollTop=
   element.scrollHeight;
 }

 time(event:VeylithEvent){
  const value=
   event.createdAt||
   event.created_at||
   event.timestamp;

  if(!value)return'--:--:--';

  const date=new Date(value);

  if(Number.isNaN(date.getTime())){
   return'--:--:--';
  }

  return date.toLocaleTimeString(
   [],
   {
    hour:'2-digit',
    minute:'2-digit',
    second:'2-digit'
   }
  );
 }

 type(event:VeylithEvent){
  return String(
   event.type||
   event.channel||
   'system.activity'
  );
 }

 message(event:VeylithEvent){
  return String(
   event.message||
   event.text||
   this.type(event)
  );
 }

 cls(event:VeylithEvent){
  const value=
   this.type(event).toLowerCase();

  if(
   value.includes('completed')||
   value.includes('success')||
   value.includes('verified')||
   value.includes('published')
  ){
   return'done';
  }

  if(
   value.includes('failed')||
   value.includes('error')
  ){
   return'failed';
  }

  if(value.includes('claimed')){
   return'claimed';
  }

  if(
   value.includes('queued')||
   value.includes('pending')
  ){
   return'queued';
  }

  if(value.includes('recovery')){
   return'recovery';
  }

  if(
   value.includes('worker')||
   value.includes('online')||
   value.includes('busy')
  ){
   return'worker';
  }

  if(
   value.includes('git')||
   value.includes('github')||
   value.includes('release')||
   value.includes('publication')
  ){
   return'git';
  }

  return'normal';
 }
}
