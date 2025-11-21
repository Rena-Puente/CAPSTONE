import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonAvatar,
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonRow,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  businessOutline,
  logInOutline,
  personCircleOutline,
  refreshOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-mi-perfil',
  standalone: true,
  templateUrl: 'mi-perfil.page.html',
  styleUrls: ['mi-perfil.page.scss'],
  imports: [
    IonAvatar,
    IonBadge,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonCol,
    IonContent,
    IonGrid,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonRefresher,
    IonRefresherContent,
    IonRow,
    IonSkeletonText,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
})
export class MiPerfilPage implements OnInit {
  private readonly sessionService = inject(SessionService);

  protected loading = true;
  protected sessionSummary: {
    userId: number | null;
    userType: number | string | null;
    companyId: number | null;
    isProfileComplete: boolean | null;
    isLoggedIn: boolean;
  } = {
    userId: null,
    userType: null,
    companyId: null,
    isProfileComplete: null,
    isLoggedIn: false,
  };

  constructor() {
    addIcons({
      personCircleOutline,
      businessOutline,
      shieldCheckmarkOutline,
      refreshOutline,
      logInOutline,
    });
  }

  ngOnInit(): void {
    void this.loadSessionSummary();
  }

  protected async refresh(event: CustomEvent): Promise<void> {
    await this.loadSessionSummary();
    event.detail.complete();
  }

  protected async refreshNow(): Promise<void> {
    await this.loadSessionSummary();
  }

  protected get userTypeLabel(): string {
    if (this.sessionSummary.userType === null || this.sessionSummary.userType === undefined) {
      return 'Sin especificar';
    }

    if (typeof this.sessionSummary.userType === 'number') {
      return `Tipo #${this.sessionSummary.userType}`;
    }

    return this.sessionSummary.userType;
  }

  protected get profileStatusLabel(): string {
    if (this.sessionSummary.isProfileComplete === null) {
      return 'Sin información';
    }

    return this.sessionSummary.isProfileComplete ? 'Completo' : 'Pendiente';
  }

  private async loadSessionSummary(): Promise<void> {
    this.loading = true;

    const [userId, userType, companyId, isProfileComplete, isLoggedIn] = await Promise.all([
      this.sessionService.getUserId(),
      this.sessionService.getUserType(),
      this.sessionService.getCompanyId(),
      this.sessionService.getProfileCompletionStatus(),
      this.sessionService.isLoggedIn(),
    ]);

    this.sessionSummary = {
      userId,
      userType,
      companyId,
      isProfileComplete,
      isLoggedIn,
    };

    this.loading = false;
  }
}
