import {ChangeDetectionStrategy,Component,computed,input} from '@angular/core';
import {DashboardData} from '../../core/models/dashboard.model';

@Component({
 selector:'app-project-velocity',
 standalone:true,
 templateUrl:'./project-velocity.html',
 styleUrl:'./project-velocity.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class ProjectVelocityComponent{
 data=input<DashboardData>({});
 points=computed(()=>{
  const events=this.data().events||[];
  const completed=events.filter(e=>String(e.type||'').toLowerCase().includes('completed'));
  if(completed.length<2)return'0,88 220,88';
  const sample=completed.slice(-12);
  return sample.map((_,i)=>{
   const x=(i/Math.max(sample.length-1,1))*220;
   const y=88-(i/Math.max(sample.length-1,1))*65;
   return `${x},${y}`;
  }).join(' ');
 });
}
