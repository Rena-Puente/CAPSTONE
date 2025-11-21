import { CommonModule } from '@angular/common';
import { Component, EnvironmentInjector, inject, OnInit } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonPage,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { briefcase, clipboard, person } from 'ionicons/icons';
import { SessionService } from '../../core/services/session.service';

const CANDIDATE_USER_TYPE = 1;
const COMPANY_USER_TYPE = 3;

@Component({
  selector: 'app-usuario-logueado',
  standalone: true,
  templateUrl: 'usuario-logueado.page.html',
  styleUrls: ['usuario-logueado.page.scss'],
  imports: [
    CommonModule,
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonPage,
    IonIcon,
    IonLabel,
    IonRouterOutlet,
  ],
})
export class UsuarioLogueadoPage implements OnInit {
  public environmentInjector = inject(EnvironmentInjector);
  private readonly sessionService = inject(SessionService);

  protected userType: number | string | null = null;

  constructor() {
    addIcons({ briefcase, clipboard, person });
  }

  ngOnInit(): void {
    this.loadUserType();
  }

  protected isCandidate(): boolean {
    if (typeof this.userType === 'string') {
      return this.userType.toLowerCase() === 'candidate';
    }

    return this.userType === CANDIDATE_USER_TYPE;
  }

  protected isCompany(): boolean {
    if (typeof this.userType === 'string') {
      return this.userType.toLowerCase() === 'company';
    }

    return this.userType === COMPANY_USER_TYPE;
  }

  private async loadUserType(): Promise<void> {
    this.userType = await this.sessionService.getUserType();
  }
}
