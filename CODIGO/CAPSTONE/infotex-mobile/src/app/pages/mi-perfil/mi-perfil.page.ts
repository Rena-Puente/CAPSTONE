import { CommonModule } from '@angular/common';
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
  briefcaseOutline,
  businessOutline,
  callOutline,
  logInOutline,
  personCircleOutline,
  refreshOutline,
  schoolOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../core/services/session.service';
import {
  ProfileEducationEntry,
  ProfileExperienceEntry,
  ProfileService,
  ProfileSkillEntry,
  UserProfileData,
} from '../../core/services/profile.service';

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
    CommonModule,
  ],
})
export class MiPerfilPage implements OnInit {
  private readonly sessionService = inject(SessionService);
  private readonly profileService = inject(ProfileService);

  protected loading = true;
  protected sessionSummary: {
    userId: number | null;
    userType: number | string | null;
    companyId: number | null;
    isProfileComplete: boolean | null;
    isLoggedIn: boolean;
    profileSlug: string | null;
  } = {
    userId: null,
    userType: null,
    companyId: null,
    isProfileComplete: null,
    isLoggedIn: false,
    profileSlug: null,
  };

  protected profileData: UserProfileData | null = null;
  protected profileError: string | null = null;

  constructor() {
    addIcons({
      briefcaseOutline,
      personCircleOutline,
      businessOutline,
      shieldCheckmarkOutline,
      callOutline,
      schoolOutline,
      sparklesOutline,
      refreshOutline,
      logInOutline,
    });
  }

  ngOnInit(): void {
    void this.loadProfile();
  }

  protected async refresh(event: CustomEvent): Promise<void> {
    await this.loadProfile();
    event.detail.complete();
  }

  protected async refreshNow(): Promise<void> {
    await this.loadProfile();
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

  protected trackById(_: number, item: ProfileEducationEntry | ProfileExperienceEntry | ProfileSkillEntry): number {
    return item.id;
  }

  protected formatDateRange(start: string | null, end: string | null): string {
    const startLabel = this.formatDate(start);
    const endLabel = end ? this.formatDate(end) : 'Actualidad';

    if (!startLabel && !endLabel) {
      return 'Sin fecha';
    }

    return [startLabel || 'Sin inicio', endLabel || 'Sin fin'].join(' - ');
  }

  private formatDate(value: string | null): string {
    if (!value) {
      return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    return parsed.toLocaleDateString('es-CL', { year: 'numeric', month: 'short' });
  }

  private async loadProfile(): Promise<void> {
    this.loading = true;
    this.profileError = null;

    const [userId, userType, companyId, isProfileComplete, isLoggedIn, profileSlug] = await Promise.all([
      this.sessionService.getUserId(),
      this.sessionService.getUserType(),
      this.sessionService.getCompanyId(),
      this.sessionService.getProfileCompletionStatus(),
      this.sessionService.isLoggedIn(),
      this.sessionService.getProfileSlug(),
    ]);

    this.sessionSummary = {
      userId,
      userType,
      companyId,
      isProfileComplete,
      isLoggedIn,
      profileSlug,
    };

    if (!profileSlug) {
      this.profileData = null;
      this.profileError = 'No encontramos el perfil del usuario logueado.';
      this.loading = false;
      return;
    }

    try {
      this.profileData = await firstValueFrom(this.profileService.getProfile(profileSlug));
    } catch (error) {
      const errorMessage =
        (error as Error)?.message ?? 'No pudimos recuperar la información de tu perfil.';
      this.profileData = null;
      this.profileError = errorMessage;
    } finally {
      this.loading = false;
    }

  }
}
