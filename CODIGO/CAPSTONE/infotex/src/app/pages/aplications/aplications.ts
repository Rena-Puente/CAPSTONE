import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApplicationsService, CandidateApplication } from '../../services/applications.service';

@Component({
  selector: 'app-aplications',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './aplications.html',
  styleUrl: './aplications.css'
})
export class Aplications {
  private readonly applicationsService = inject(ApplicationsService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly applications = signal<CandidateApplication[]>([]);
  protected readonly stats = computed(() => {
    const applications = this.applications();

    let active = 0;
    let accepted = 0;
    let inReview = 0;
    let lastUpdate: Date | null = null;

    for (const application of applications) {
      if (application.offerActive !== false) {
        active += 1;
      }

      const normalizedStatus = this.normalizeStatusForComparison(application.status);

      if (normalizedStatus === 'aceptada' || normalizedStatus === 'accepted') {
        accepted += 1;
      }

      if (
        normalizedStatus === 'en_revision' ||
        normalizedStatus === 'revision' ||
        normalizedStatus === 'en_proceso' ||
        normalizedStatus === 'postulada' ||
        normalizedStatus === 'enviada'
      ) {
        inReview += 1;
      }

      const candidateDate = this.extractRelevantDate(application);

      if (candidateDate && (!lastUpdate || candidateDate > lastUpdate)) {
        lastUpdate = candidateDate;
      }
    }

    return {
      total: applications.length,
      active,
      accepted,
      inReview,
      lastUpdate
    };
  });

  constructor() {
    void this.loadApplications();
  }

  protected trackByApplicationId(index: number, application: CandidateApplication): number {
    return application?.id ?? index;
  }

  protected formatStatus(status: string | null): string {
    if (!status) {
      return 'Estado desconocido';
    }

    const normalized = status
      .trim()
      .toLowerCase()
      .replace(/[^a-záéíóúñü0-9_\s-]/giu, '')
      .replace(/[_-]+/g, ' ');

    if (!normalized) {
      return 'Estado desconocido';
    }

    return normalized
      .split(/\s+/u)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  protected getStatusBadgeClass(status: string | null): string {
    const normalized = status?.trim().toLowerCase();

    switch (normalized) {
      case 'aceptada':
        return 'badge bg-success';
      case 'rechazada':
        return 'badge bg-danger';
      case 'en_revision':
      case 'revision':
        return 'badge bg-warning text-dark';
      case 'enviada':
      case 'postulada':
        return 'badge bg-info text-dark';
      default:
        return 'badge bg-secondary';
    }
  }

  protected getLocationLabel(application: CandidateApplication): string | null {
    const city = application?.city?.trim();
    const country = application?.country?.trim();

    if (city && country) {
      return `${city}, ${country}`;
    }

    return city || country || null;
  }

  protected getCardAccentClass(status: string | null): string {
    const normalizedStatus = this.normalizeStatusForComparison(status);

    switch (normalizedStatus) {
      case 'aceptada':
      case 'accepted':
        return 'application-card--accepted';
      case 'rechazada':
      case 'rejected':
        return 'application-card--rejected';
      case 'en_revision':
      case 'revision':
      case 'en_proceso':
        return 'application-card--review';
      default:
        return 'application-card--default';
    }
  }

  private async loadApplications(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const applications = await firstValueFrom(this.applicationsService.listCurrentUserApplications());
      this.applications.set(applications);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudieron obtener tus postulaciones.';
      this.error.set(message);
      this.applications.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private normalizeStatusForComparison(status: string | null | undefined): string {
    if (!status) {
      return '';
    }

    return status
      .trim()
      .toLowerCase()
      .replace(/[^a-záéíóúñü0-9_\s-]/giu, '')
      .replace(/\s+/g, ' ')
      .replace(/\s/g, '_');
  }

  private extractRelevantDate(application: CandidateApplication): Date | null {
    const rawDate = application.updatedAt ?? application.submittedAt ?? application.offerPublishedAt;

    if (!rawDate) {
      return null;
    }

    const candidateDate = new Date(rawDate);

    return Number.isNaN(candidateDate.getTime()) ? null : candidateDate;
  }
}
