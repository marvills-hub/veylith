import {ChangeDetectionStrategy,Component,input,signal} from '@angular/core';
import {DashboardData} from '../../core/models/dashboard.model';

@Component({
 selector:'app-system-monitor',
 standalone:true,
 templateUrl:'./system-monitor.html',
 styleUrl:'./system-monitor.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class SystemMonitorComponent{
 data=input<DashboardData>({});
 open=signal(false);
 toggle(){this.open.update(v=>!v)}
}
