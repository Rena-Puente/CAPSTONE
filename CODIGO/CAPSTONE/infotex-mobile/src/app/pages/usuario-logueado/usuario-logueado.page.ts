import { Component, EnvironmentInjector, inject } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { briefcase, clipboard, person } from 'ionicons/icons';

@Component({
  selector: 'app-usuario-logueado',
  standalone: true,
  templateUrl: 'usuario-logueado.page.html',
  styleUrls: ['usuario-logueado.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet],
})
export class UsuarioLogueadoPage {
  public environmentInjector = inject(EnvironmentInjector);

  constructor() {
    addIcons({ briefcase, clipboard, person });
  }
}
