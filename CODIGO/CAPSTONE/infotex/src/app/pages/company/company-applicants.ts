import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CompanyService, CompanyApplicant } from '../../services/company.service';

@Component({
  selector: 'app-company-applicants',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './company-applicants.html'
})
export class CompanyApplicants {
  private readonly companyService = inject(CompanyService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly applicants = signal<CompanyApplicant[]>([]);

  constructor() {
    void this.loadApplicants();
  }

  private async loadApplicants(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const list = await firstValueFrom(this.companyService.listApplicants());
      this.applicants.set(list);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo obtener la lista de postulantes.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
