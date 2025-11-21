import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonBackButton,
  IonBadge,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { SafeHtml, DomSanitizer } from '@angular/platform-browser';
import { Subscription } from 'rxjs';

import { JobService } from '../../core/services/job.service';
import { Job } from '../../core/models';
import { briefcaseOutline, locationOutline, timeOutline } from 'ionicons/icons';
import { addIcons } from 'ionicons';

addIcons({ briefcaseOutline, locationOutline, timeOutline });

@Component({
  selector: 'app-job-detail',
  standalone: true,
  templateUrl: './job-detail.page.html',
  styleUrls: ['./job-detail.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonLabel,
    IonBadge,
    IonButton,
    IonSpinner,
  ],
})
export class JobDetailPage implements OnInit, OnDestroy {
  private readonly jobService = inject(JobService);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  protected job: Job | null = null;
  protected sanitizedDescription?: SafeHtml;
  protected loading = true;
  protected error: string | null = null;

  private routeSub?: Subscription;
  private jobSub?: Subscription;

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      const offerId = idParam ? Number(idParam) : NaN;

      if (!offerId) {
        this.error = 'Oferta no encontrada.';
        this.loading = false;
        return;
      }

      this.fetchJob(offerId);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.jobSub?.unsubscribe();
  }

  protected reload(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const offerId = idParam ? Number(idParam) : NaN;

    if (!offerId) {
      return;
    }

    this.fetchJob(offerId);
  }

  private fetchJob(offerId: number): void {
    this.loading = true;
    this.error = null;
    this.jobSub?.unsubscribe();

    this.jobSub = this.jobService.getPublicJob(offerId).subscribe({
      next: (job) => {
        this.job = job;
        this.sanitizedDescription = job?.description
          ? this.sanitizer.bypassSecurityTrustHtml(job.description)
          : 'Esta oferta no incluye una descripción detallada.';
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudo cargar la oferta seleccionada.';
        this.loading = false;
      },
    });
  }
}
