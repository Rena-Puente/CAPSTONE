import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, ElementRef, HostListener, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApplicationsService } from '../../services/applications.service';
import { OffersService, PublicOffer } from '../../services/offers.service';
import { ProfileData, ProfileService } from '../../services/profile.service';
import chileRegionsData from '../../../assets/data/ciudades.json';

type FilterKey = 'career' | 'modality' | 'region';
type OfferModality = 'remote' | 'hybrid' | 'onsite' | 'other';
type ChileRegionMap = Record<string, Record<string, string>>;

interface OfferFilterMetadata {
  category: string | null;
  region: string | null;
  modality: OfferModality;
}

const UNKNOWN_CATEGORY_LABEL = 'Sin categoría asociada';
const UNKNOWN_REGION_LABEL = 'Ubicación no especificada';
const FOREIGN_REGION_LABEL = 'Fuera de Chile';

const REGION_DATA: ChileRegionMap = chileRegionsData as ChileRegionMap;
const REGION_ORDER = Object.keys(REGION_DATA);
const REGION_LOOKUPS = buildRegionLookups(REGION_DATA);
const REGION_FILTER_OPTIONS: string[] = [...REGION_ORDER, FOREIGN_REGION_LABEL, UNKNOWN_REGION_LABEL];

const FILTER_MENU_IDS: Record<FilterKey, string> = {
  career: 'home-filter-career',
  modality: 'home-filter-modality',
  region: 'home-filter-region'
};

const MODALITY_OPTIONS: ReadonlyArray<{ id: OfferModality; label: string; description: string }> = [
  { id: 'remote', label: 'Remoto', description: 'Trabajo completamente remoto' },
  { id: 'hybrid', label: 'Híbrido', description: 'Trabajo mixto entre remoto y presencial' },
  { id: 'onsite', label: 'Presencial', description: 'Trabajo en oficina o terreno' },
  { id: 'other', label: 'Otro', description: 'Modalidad no especificada' }
];

const MODALITY_KEYWORDS: Record<Exclude<OfferModality, 'other'>, string[]> = {
  remote: ['remoto', 'remote', 'teletrabajo', 'home office', 'desde casa', 'anywhere'],
  hybrid: ['hybrid', 'hibrido', 'híbrido', 'mixto', 'flexible'],
  onsite: ['onsite', 'presencial', 'oficina', 'en sitio', 'campo']
};

function buildRegionLookups(data: ChileRegionMap) {
  const city = new Map<string, string>();
  const province = new Map<string, string>();

  for (const [regionName, provinces] of Object.entries(data)) {
    for (const [provinceName, cityName] of Object.entries(provinces ?? {})) {
      const provinceKey = normalizeLookup(provinceName);

      if (provinceKey) {
        province.set(provinceKey, regionName);
      }

      const cityKey = normalizeLookup(cityName);

      if (cityKey) {
        city.set(cityKey, regionName);
      }
    }
  }

  return { city, province };
}

function normalizeLookup(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function normalizeRegionCandidate(value: string | null | undefined): string {
  const normalized = normalizeLookup(value);

  if (!normalized) {
    return '';
  }

  return normalized.replace(/^region\s+(de\s+)?/u, '');
}

function matchRegionName(value: string | null | undefined): string | null {
  const candidate = normalizeRegionCandidate(value);

  if (!candidate) {
    return null;
  }

  for (const region of REGION_ORDER) {
    if (normalizeRegionCandidate(region) === candidate) {
      return region;
    }
  }

  return null;
}

function findRegionByCity(city: string | null | undefined): string | null {
  const normalized = normalizeLookup(city);

  if (!normalized) {
    return null;
  }

  return REGION_LOOKUPS.city.get(normalized) ?? REGION_LOOKUPS.province.get(normalized) ?? null;
}

function formatDisplayLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed
    .split(/\s+/u)
    .map((part) => {
      if (part.length <= 2 && part === part.toUpperCase()) {
        return part.toUpperCase();
      }

      return part.charAt(0).toLocaleUpperCase('es') + part.slice(1).toLocaleLowerCase('es');
    })
    .join(' ');
}

function resolveModalityFromString(value: string | null | undefined): OfferModality {
  const normalized = normalizeLookup(value);

  if (!normalized) {
    return 'other';
  }

  if (MODALITY_KEYWORDS.remote.some((keyword) => normalized.includes(keyword))) {
    return 'remote';
  }

  if (MODALITY_KEYWORDS.hybrid.some((keyword) => normalized.includes(keyword))) {
    return 'hybrid';
  }

  if (MODALITY_KEYWORDS.onsite.some((keyword) => normalized.includes(keyword))) {
    return 'onsite';
  }

  return 'other';
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  private readonly offersService = inject(OffersService);
  private readonly applicationsService = inject(ApplicationsService);
  private readonly profileService = inject(ProfileService);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly offerMetadataCache = new WeakMap<PublicOffer, OfferFilterMetadata>();

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
  protected readonly filteredOffers = computed(() => this.applyOfferFilters());
  protected readonly selectedCareerCategories = signal<Set<string>>(new Set());
  protected readonly selectedModalities = signal<Set<OfferModality>>(new Set());
  protected readonly selectedRegions = signal<Set<string>>(new Set());
  protected readonly expandedFilter = signal<FilterKey | null>(null);
  protected readonly careerCategoryOptions = computed(() => this.buildCareerCategoryOptions());
  protected readonly modalityOptions = MODALITY_OPTIONS;
  protected readonly regionOptions = REGION_FILTER_OPTIONS;
  protected readonly filterMenuIds = FILTER_MENU_IDS;
  protected readonly activeFiltersCount = computed(
    () =>
      this.selectedCareerCategories().size +
      this.selectedModalities().size +
      this.selectedRegions().size
  );

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
    void this.loadExistingApplications();
    void this.loadProfile();
  }

  protected trackByOfferId(_: number, offer: PublicOffer): number {
    return offer?.id ?? _;
  }

  protected trackByModality(_: number, option: { id: OfferModality }): string {
    return option?.id ?? String(_);
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
    const explicitAvatar = offer?.company?.avatarUrl?.trim();

    if (explicitAvatar) {
      return explicitAvatar;
    }

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

  protected trackByLabel(_: number, label: string): string {
    return label;
  }

  protected isFilterOpen(key: FilterKey): boolean {
    return this.expandedFilter() === key;
  }

  protected toggleFilterDropdown(key: FilterKey): void {
    this.expandedFilter.update((current) => (current === key ? null : key));
  }

  protected toggleCategory(category: string): void {
    this.selectedCareerCategories.update((current) => {
      const next = new Set(current);

      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }

      return next;
    });
  }

  protected isCategorySelected(category: string): boolean {
    return this.selectedCareerCategories().has(category);
  }

  protected toggleModality(modality: OfferModality): void {
    this.selectedModalities.update((current) => {
      const next = new Set(current);

      if (next.has(modality)) {
        next.delete(modality);
      } else {
        next.add(modality);
      }

      return next;
    });
  }

  protected isModalitySelected(modality: OfferModality): boolean {
    return this.selectedModalities().has(modality);
  }

  protected toggleRegion(region: string): void {
    this.selectedRegions.update((current) => {
      const next = new Set(current);

      if (next.has(region)) {
        next.delete(region);
      } else {
        next.add(region);
      }

      return next;
    });
  }

  protected isRegionSelected(region: string): boolean {
    return this.selectedRegions().has(region);
  }

  protected clearFilters(): void {
    this.selectedCareerCategories.set(new Set());
    this.selectedModalities.set(new Set());
    this.selectedRegions.set(new Set());
    this.expandedFilter.set(null);
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    const host = this.hostElement?.nativeElement;
    const target = event?.target;

    if (!host || !(target instanceof Node)) {
      return;
    }

    if (!host.contains(target)) {
      this.expandedFilter.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  protected closeFiltersOnEscape(): void {
    this.expandedFilter.set(null);
  }

  private applyOfferFilters(): PublicOffer[] {
    const offers = this.offers();
    const categories = this.selectedCareerCategories();
    const modalities = this.selectedModalities();
    const regions = this.selectedRegions();

    if (offers.length === 0) {
      return offers;
    }

    if (!categories.size && !modalities.size && !regions.size) {
      return offers;
    }

    return offers.filter((offer) => {
      const metadata = this.getOfferFilterMetadata(offer);

      if (categories.size > 0) {
        const categoryLabel = metadata.category ?? UNKNOWN_CATEGORY_LABEL;

        if (!categories.has(categoryLabel)) {
          return false;
        }
      }

      if (modalities.size > 0 && !modalities.has(metadata.modality)) {
        return false;
      }

      if (regions.size > 0) {
        const regionLabel = metadata.region ?? UNKNOWN_REGION_LABEL;

        if (!regions.has(regionLabel)) {
          return false;
        }
      }

      return true;
    });
  }

  private buildCareerCategoryOptions(): string[] {
    const categories = new Map<string, string>();
    let includeUnknown = false;

    for (const offer of this.offers()) {
      const category = this.getOfferFilterMetadata(offer).category;

      if (category) {
        const key = normalizeLookup(category);

        if (key && !categories.has(key)) {
          categories.set(key, category);
        }
      } else {
        includeUnknown = true;
      }
    }

    const sorted = Array.from(categories.values()).sort((a, b) => a.localeCompare(b, 'es'));

    if (includeUnknown) {
      sorted.push(UNKNOWN_CATEGORY_LABEL);
    }

    return sorted;
  }

  private getOfferFilterMetadata(offer: PublicOffer): OfferFilterMetadata {
    let metadata = this.offerMetadataCache.get(offer);

    if (metadata) {
      return metadata;
    }

    metadata = {
      category: this.computeOfferCategory(offer),
      region: this.computeOfferRegion(offer),
      modality: this.computeOfferModality(offer)
    };

    this.offerMetadataCache.set(offer, metadata);

    return metadata;
  }

  private computeOfferCategory(offer: PublicOffer): string | null {
    const rawCategory =
      offer.careerCategory ??
      offer.procedure ??
      offer.career ??
      this.readStringField(
        offer,
        'categoria',
        'categoriaCarrera',
        'careerType',
        'specialty',
        'especialidad'
      );

    return formatDisplayLabel(rawCategory);
  }

  private computeOfferRegion(offer: PublicOffer): string | null {
    const directRegion = matchRegionName(
      offer.region ?? this.readStringField(offer, 'region', 'regionOferta', 'region_name')
    );

    if (directRegion) {
      return directRegion;
    }

    const cityCandidates = [
      offer.city,
      offer.company?.city ?? null,
      this.readStringField(offer, 'city', 'ciudad', 'comuna', 'cityName'),
      this.readStringField(offer, 'province', 'provincia'),
      this.readStringField(offer.company, 'city', 'ciudad')
    ];

    for (const candidate of cityCandidates) {
      const region = findRegionByCity(candidate);

      if (region) {
        return region;
      }
    }

    const countryCandidate =
      offer.country ??
      offer.company?.country ??
      this.readStringField(offer, 'country', 'pais', 'countryName');
    const normalizedCountry = normalizeLookup(countryCandidate);

    if (normalizedCountry && normalizedCountry !== 'chile') {
      return FOREIGN_REGION_LABEL;
    }

    return null;
  }

  private computeOfferModality(offer: PublicOffer): OfferModality {
    const rawModality =
      offer.modality ??
      offer.locationType ??
      this.readStringField(offer, 'modalidad', 'workMode', 'work_mode', 'tipoUbicacion');

    return resolveModalityFromString(rawModality);
  }

  private readStringField(source: unknown, ...keys: string[]): string | null {
    if (!source || typeof source !== 'object') {
      return null;
    }

    const record = source as Record<string, unknown>;

    for (const key of keys) {
      if (!key) {
        continue;
      }

      const variations = new Set<string>([key, key.toLowerCase(), key.toUpperCase()]);

      for (const variation of variations) {
        const value = record[variation];

        if (typeof value === 'string') {
          const trimmed = value.trim();

          if (trimmed) {
            return trimmed;
          }
        }
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

  private async loadExistingApplications(): Promise<void> {
    try {
      const applications = await firstValueFrom(
        this.applicationsService.listCurrentUserApplications()
      );
      const appliedOfferIds = applications
        .map((application) => application.offerId)
        .filter(
          (offerId): offerId is number =>
            typeof offerId === 'number' && Number.isFinite(offerId) && offerId > 0
        );

      this.appliedOffers.set(new Set(appliedOfferIds));
    } catch (error) {
      console.error('[Home] Failed to load existing applications', error);
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
