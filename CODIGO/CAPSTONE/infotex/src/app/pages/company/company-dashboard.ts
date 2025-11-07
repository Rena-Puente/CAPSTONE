import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { CompanyService, CompanyProfile } from '../../services/company.service';

@Component({
  selector: 'app-company-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './company-dashboard.html',
  styleUrl: './company-dashboard.css'
})
export class CompanyDashboard {
  private readonly companyService = inject(CompanyService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly company = signal<CompanyProfile | null>(null);

  constructor() {
    void this.loadCompany();
  }

  private async loadCompany(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const profile = await firstValueFrom(this.companyService.getMyCompanyProfile());
      this.company.set(profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo obtener la información de la empresa.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
