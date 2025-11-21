import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonInput,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';

import { JobService, ApplyJobPayload } from '../../core/services/job.service';
import { Job } from '../../core/models';
import { ApplyModalComponent } from './components/apply-modal.component';
import { JobCardComponent } from './components/job-card.component';

@Component({
  selector: 'app-empleos',
  standalone: true,
  templateUrl: 'empleos.page.html',
  styleUrls: ['empleos.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonSearchbar,
    IonInput,
    IonRefresher,
    IonRefresherContent,
    ApplyModalComponent,
    JobCardComponent,
  ],
})
export class EmpleosPage implements OnInit, AfterViewInit {
  private readonly jobService = inject(JobService);
  private readonly router = inject(Router);

  @ViewChild(IonContent) content?: IonContent;
  protected jobs: Job[] = [];
  protected filteredJobs: Job[] = [];
  protected favorites = new Set<number>();
  protected applied = new Set<number>();
  protected searchTerm = '';
  protected locationFilter = '';
  protected loading = false;
  protected error: string | null = null;
  protected applyingJob: Job | null = null;
  protected submitting = false;
  protected presentingElement: HTMLElement | null = null;

  ngOnInit(): void {
    this.loadJobs();
  }

  ngAfterViewInit(): void {
    const routerOutlet = document.querySelector('ion-router-outlet');
    this.presentingElement = (routerOutlet as HTMLElement) ?? null;
  }

  protected loadJobs(event?: CustomEvent): void {
    this.loading = true;
    this.error = null;

    this.jobService.getPublicJobs().subscribe({
      next: (jobs) => {
        this.jobs = jobs ?? [];
        this.applyFilters();
        this.loading = false;
        event?.detail?.complete?.();
      },
      error: () => {
        this.loading = false;
        this.error = 'No se pudieron cargar las ofertas.';
        event?.detail?.complete?.();
      },
    });
  }

  protected applyFilters(): void {
    const term = this.searchTerm.toLowerCase().trim();
    const location = this.locationFilter.toLowerCase().trim();

    this.filteredJobs = this.jobs.filter((job) => {
      const matchesTerm = !term ||
        job.title?.toLowerCase().includes(term) ||
        job.description?.toLowerCase().includes(term) ||
        job.company?.name?.toLowerCase().includes(term);
      const matchesLocation = !location ||
        job.city?.toLowerCase().includes(location) ||
        job.country?.toLowerCase().includes(location);

      return matchesTerm && matchesLocation;
    });
  }

  protected onSearchChange(event: CustomEvent): void {
    const value = (event?.detail as { value?: string })?.value ?? '';
    this.searchTerm = value;
    this.applyFilters();
  }

  protected onLocationChange(event: CustomEvent): void {
    const value = (event?.detail as { value?: string })?.value ?? '';
    this.locationFilter = value;
    this.applyFilters();
  }

  protected toggleFavorite(job: Job): void {
    if (!job?.id) {
      return;
    }

    if (this.favorites.has(job.id)) {
      this.favorites.delete(job.id);
    } else {
      this.favorites.add(job.id);
    }
  }

  protected openApply(job: Job): void {
    if (!job) {
      return;
    }

    console.info('[Empleos] Opening apply modal', { jobId: job.id, title: job.title });
    this.applyingJob = job;
    console.info('[Empleos] applyingJob set', this.applyingJob);
  }

  protected closeApply(): void {
    console.info('[Empleos] Closing apply modal');
    this.applyingJob = null;
    console.info('[Empleos] applyingJob reset', this.applyingJob);
  }

  protected submitApplication(payload: ApplyJobPayload): void {
    const job = this.applyingJob;

    if (!job?.id || this.submitting) {
      return;
    }

    this.submitting = true;

    this.jobService.applyToJob(job.id, payload).subscribe({
      next: () => {
        this.applied.add(job.id);
        this.submitting = false;
        this.closeApply();
      },
      error: () => {
        this.submitting = false;
      },
    });
  }

  protected viewDetail(job: Job): void {
    if (!job?.id) {
      return;
    }

    void this.router.navigate(['/usuario-logueado/empleos', job.id]);
  }
}
