import {AfterViewChecked,ChangeDetectionStrategy,Component,ElementRef,ViewChild,computed,input} from '@angular/core';
import {DashboardData,VeylithEvent} from '../../core/models/dashboard.model';
import {activeAgent,roleLabel} from '../../core/services/dashboard.helpers';

@Component({
 selector:'app-development-terminal',
 standalone:true,
 templateUrl:'./development-terminal.html',
 styleUrl:'./development-terminal.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class DevelopmentTerminalComponent implements AfterViewChecked{
 data=input<DashboardData>({});
 @ViewChild('feed') feed?:ElementRef<HTMLDivElement>;
 rows=computed(()=>this.data().events?.slice(-80)||[]);
 worker=computed(()=>roleLabel(activeAgent(this.data())));

 ngAfterViewChecked(){
  const el=this.feed?.nativeElement;
  if(el)el.scrollTop=el.scrollHeight;
 }

 time(event:VeylithEvent){
  const value=event.createdAt||event.created_at||event.timestamp;
  const date=value?new Date(value):new Date();
  return Number.isNaN(date.getTime())?'--:--:--':date.toLocaleTimeString([],{
   hour:'2-digit',minute:'2-digit',second:'2-digit'
  });
 }

 message(event:VeylithEvent){
  const raw=String(event.message||event.text||event.type||event.channel||'activity');
  return raw
   .replace(/^queued task had no active job; persistent job created$/i,'Prepared executable work')
   .replace(/^startup recovery completed$/i,'Veylith restored project execution state')
   .replace(/^live job recovery reconciled runtime state$/i,'Execution state synchronized')
   .replace(/\bjob\b/gi,'work');
 }
}
