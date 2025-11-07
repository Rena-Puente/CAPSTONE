import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CompanyService, CompanyProfile as CompanyProfileModel } from '../../services/company.service';

@Component({
  selector: 'app-company-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './company-profile.html'
})
export class CompanyProfile {
  private readonly companyService = inject(CompanyService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly profile = signal<CompanyProfileModel | null>(null);

  constructor() {
    void this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const company = await firstValueFrom(this.companyService.getMyCompanyProfile());
      this.profile.set(company);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar el perfil de la empresa.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
