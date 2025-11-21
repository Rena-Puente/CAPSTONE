import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Job } from '../../core/models';
import { JobService } from '../../core/services/job.service';
import { JobCardComponent } from '../empleos/components/job-card.component';

@Component({
  selector: 'app-mis-empleos',
  standalone: true,
  templateUrl: 'mis-empleos.page.html',
  styleUrls: ['mis-empleos.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonRefresher,
    IonRefresherContent,
    JobCardComponent,
  ]
})
export class MisEmpleosPage implements OnInit {
  private readonly jobService = inject(JobService);
  private readonly router = inject(Router);

  protected jobs: Job[] = [];
  protected loading = false;
  protected error: string | null = null;
  protected updating = new Set<number>();

  ngOnInit(): void {
    this.loadCompanyJobs();
  }

  protected loadCompanyJobs(event?: CustomEvent): void {
    this.loading = true;
    this.error = null;

    this.jobService.listCompanyJobs().subscribe({
      next: (jobs) => {
        this.jobs = jobs ?? [];
        this.loading = false;
        event?.detail?.complete?.();
      },
      error: () => {
        this.loading = false;
        this.error = 'No se pudieron obtener tus ofertas.';
        event?.detail?.complete?.();
      }
    });
  }

  protected toggleActive(job: Job): void {
    if (!job?.id || this.updating.has(job.id)) {
      return;
    }

    this.updating.add(job.id);

    this.jobService.updateJobActiveState(job.id, !job.active).subscribe({
      next: (response) => {
        const found = this.jobs.find((item) => item.id === response.offerId);
        if (found) {
          found.active = response.active;
        }
        this.updating.delete(job.id);
      },
      error: () => this.updating.delete(job.id),
    });
  }

  protected remove(job: Job): void {
    if (!job?.id || this.updating.has(job.id)) {
      return;
    }

    this.updating.add(job.id);

    this.jobService.deleteJob(job.id).subscribe({
      next: () => {
        this.jobs = this.jobs.filter((item) => item.id !== job.id);
        this.updating.delete(job.id);
      },
      error: () => this.updating.delete(job.id),
    });
  }

  protected viewDetail(job: Job): void {
    if (!job?.id) {
      return;
    }

    void this.router.navigate(['/usuario-logueado/empleos', job.id]);
  }
}
