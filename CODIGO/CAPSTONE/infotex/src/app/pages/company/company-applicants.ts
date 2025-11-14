import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  CompanyService,
  CompanyApplicant,
  CompanyOfferSummary
} from '../../services/company.service';

@Component({
  selector: 'app-company-applicants',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './company-applicants.html',
  styleUrl: './company-applicants.css'
})
export class CompanyApplicants {
  private readonly companyService = inject(CompanyService);
  private readonly document = inject(DOCUMENT, { optional: true }) as Document | null;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly applicants = signal<CompanyApplicant[]>([]);
  protected readonly offers = signal<CompanyOfferSummary[]>([]);
  protected readonly selectedOfferId = signal<number | null>(null);

  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadOffers();
  }

  private async loadOffers(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.offers.set([]);

    let offerToAutoload: number | null = null;

    try {
      const offers = await firstValueFrom(this.companyService.listMyOffers());
      this.offers.set(offers);

      if (offers.length === 0) {
        this.selectedOfferId.set(null);
        this.applicants.set([]);
      }

      if (offers.length === 1) {
        const firstOfferId = offers[0]?.id;

        if (Number.isInteger(firstOfferId) && firstOfferId > 0) {
          this.selectedOfferId.set(firstOfferId);
          offerToAutoload = firstOfferId;
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudieron obtener las ofertas de la empresa.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }

    if (offerToAutoload !== null) {
      await this.loadApplicantsForOffer(offerToAutoload);
    }
  }

  protected async onOfferSelected(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement | null;
    const value = target?.value ?? '';

    if (!value) {
      this.selectedOfferId.set(null);
      this.applicants.set([]);
      return;
    }

    const offerId = Number.parseInt(value, 10);

    if (!Number.isInteger(offerId) || offerId <= 0) {
      this.selectedOfferId.set(null);
      this.applicants.set([]);
      return;
    }

    this.selectedOfferId.set(offerId);
    await this.loadApplicantsForOffer(offerId);
  }

  private async loadApplicantsForOffer(offerId: number): Promise<void> {
    if (!Number.isInteger(offerId) || offerId <= 0) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.applicants.set([]);

    try {
      const list = await firstValueFrom(this.companyService.listApplicantsForOffer(offerId));
      this.applicants.set(list);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo obtener la lista de postulantes.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  protected buildProfileUrl(applicant: CompanyApplicant): string | null {
    const slug = applicant.applicantProfileSlug?.trim();

    if (!slug) {
      return null;
    }

    const origin = this.document?.location?.origin ?? '';

    if (!origin) {
      return `/user/${slug}`;
    }

    try {
      return new URL(`/user/${slug}`, origin).toString();
    } catch {
      const normalizedOrigin = origin.replace(/\/$/, '');
      return `${normalizedOrigin}/user/${slug}`;
    }
  }
}
