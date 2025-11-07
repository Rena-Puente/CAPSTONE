import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { OffersService, PublicOffer } from '../../services/offers.service';
import { ProfileData, ProfileService } from '../../services/profile.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  private readonly offersService = inject(OffersService);
  private readonly profileService = inject(ProfileService);

  protected readonly loading = signal(false);
  protected readonly offers = signal<PublicOffer[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly globalMessage = signal<string | null>(null);

  protected readonly biography = signal<string | null>(null);
  protected readonly biographyLoading = signal(false);
  protected readonly biographyError = signal<string | null>(null);
  protected readonly displayName = signal<string | null>(null);

  protected readonly applyingOffers = signal<Set<number>>(new Set());
  protected readonly appliedOffers = signal<Set<number>>(new Set());
  protected readonly applicationErrors = signal<Map<number, string>>(new Map());

  protected readonly missingBiography = computed(() => {
    if (this.biographyLoading()) {
      return false;
    }

    if (this.biographyError()) {
      return true;
    }

    const bio = this.biography();
    return !bio || bio.trim().length === 0;
  });

  constructor() {
    void this.loadOffers();
    void this.loadProfile();
  }

  protected trackByOfferId(_: number, offer: PublicOffer): number {
    return offer?.id ?? _;
  }

  protected isApplying(offerId: number): boolean {
    return this.applyingOffers().has(offerId);
  }

  protected isApplied(offerId: number): boolean {
    return this.appliedOffers().has(offerId);
  }

  protected getApplicationError(offerId: number): string | null {
    return this.applicationErrors().get(offerId) ?? null;
  }

  protected getCompanyDisplayName(offer: PublicOffer): string {
    return offer?.company?.name?.trim() || 'Empresa sin nombre';
  }

  protected getCompanyInitials(offer: PublicOffer): string {
    const name = this.getCompanyDisplayName(offer);
    const parts = name.split(/\s+/u).filter(Boolean);

    if (parts.length === 0) {
      return 'E';
    }

    const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
    return initials.join('') || 'E';
  }

  protected getCompanyLogoUrl(offer: PublicOffer): string | null {
    const explicitLogo = offer?.company?.logoUrl?.trim();

    if (explicitLogo) {
      return explicitLogo;
    }

    const website = offer?.company?.website?.trim();

    if (website) {
      try {
        const normalized = website.startsWith('http://') || website.startsWith('https://')
          ? website
          : `https://${website}`;
        const { hostname } = new URL(normalized);

        if (hostname) {
          return `https://logo.clearbit.com/${hostname}`;
        }
      } catch {
        // Ignore URL parsing errors and fall through to the initials fallback.
      }
    }

    return null;
  }

  protected async applyToOffer(offer: PublicOffer): Promise<void> {
    if (!offer || !offer.id || this.isApplying(offer.id) || this.isApplied(offer.id)) {
      return;
    }

    if (this.missingBiography()) {
      this.globalMessage.set(null);
      this.applicationErrors.update((errors) => {
        const next = new Map(errors);
        next.set(offer.id, 'Completa tu biografía para usarla como carta de presentación.');
        return next;
      });
      return;
    }

    const coverLetter = this.biography()?.trim() ?? '';

    this.applicationErrors.update((errors) => {
      const next = new Map(errors);
      next.delete(offer.id);
      return next;
    });

    this.applyingOffers.update((set) => {
      const next = new Set(set);
      next.add(offer.id);
      return next;
    });

    this.globalMessage.set(null);

    try {
      await firstValueFrom(this.offersService.applyToOffer(offer.id, coverLetter));

      this.appliedOffers.update((set) => {
        const next = new Set(set);
        next.add(offer.id);
        return next;
      });

      this.globalMessage.set(
        `Tu postulación a "${offer.title ?? 'esta oferta'}" fue enviada correctamente.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar la postulación.';

      this.applicationErrors.update((errors) => {
        const next = new Map(errors);
        next.set(offer.id, message);
        return next;
      });
    } finally {
      this.applyingOffers.update((set) => {
        const next = new Set(set);
        next.delete(offer.id);
        return next;
      });
    }
  }

  private async loadOffers(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const offers = await firstValueFrom(this.offersService.listOffers());
      this.offers.set(offers);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudieron obtener las ofertas disponibles.';
      this.error.set(message);
      this.offers.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadProfile(): Promise<void> {
    this.biographyLoading.set(true);
    this.biographyError.set(null);

    try {
      const profile = await firstValueFrom(this.profileService.getProfile());
      this.applyProfile(profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar tu perfil.';
      this.biographyError.set(message);
      this.biography.set(null);
      this.displayName.set(null);
    } finally {
      this.biographyLoading.set(false);
    }
  }

  private applyProfile(profile: ProfileData): void {
    if (!profile) {
      this.biography.set(null);
      this.displayName.set(null);
      return;
    }

    this.biography.set(profile.biography ?? '');
    this.displayName.set(profile.displayName ?? null);
  }
}
