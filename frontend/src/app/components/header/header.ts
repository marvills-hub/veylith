import {ChangeDetectionStrategy,Component,input} from '@angular/core';

@Component({
 selector:'app-header',
 standalone:true,
 templateUrl:'./header.html',
 styleUrl:'./header.scss',
 changeDetection:ChangeDetectionStrategy.OnPush
})
export class HeaderComponent{
 live=input(false);
}
