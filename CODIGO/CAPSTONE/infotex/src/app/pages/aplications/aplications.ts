import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
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

}
