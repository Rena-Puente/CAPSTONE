import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBadge,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import {
  ApplicationsService,
  CandidateApplication,
} from '../../core/services/applications.service';

@Component({
  selector: 'app-mis-postulaciones',
  standalone: true,
  templateUrl: 'mis-postulaciones.page.html',
  styleUrls: ['mis-postulaciones.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonBadge,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class MisPostulacionesPage implements OnInit {
  private readonly applicationsService = inject(ApplicationsService);
  private readonly router = inject(Router);

  protected applications: CandidateApplication[] = [];
  protected loading = false;
  protected error: string | null = null;

  ngOnInit(): void {
    this.loadApplications();
  }

  protected loadApplications(event?: CustomEvent): void {
    this.loading = true;
    this.error = null;

    this.applicationsService.listCurrentUserApplications().subscribe({
      next: (applications) => {
        this.applications = applications ?? [];
        this.loading = false;
        event?.detail?.complete?.();
      },
      error: (err) => {
        this.error = err?.message || 'No se pudieron obtener tus postulaciones.';
        this.loading = false;
        event?.detail?.complete?.();
      },
    });
  }

  protected viewOffer(application: CandidateApplication): void {
    if (!application?.offerId) {
      return;
    }

    void this.router.navigate(['/usuario-logueado/empleos', application.offerId]);
  }
}
