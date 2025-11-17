import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, ElementRef, HostListener, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApplicationsService } from '../../services/applications.service';
import { OffersService, PublicOffer } from '../../services/offers.service';
import { ProfileData, ProfileService } from '../../services/profile.service';
import { ProfileFieldsService } from '../../services/profilefields.service';
import chileRegionsData from '../../../assets/data/ciudades.json';
import type { ApplicantAnswer } from '../../services/company.service';

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
  private readonly profileFieldsService = inject(ProfileFieldsService);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly offerMetadataCache = new WeakMap<
    PublicOffer,
    { version: number; metadata: OfferFilterMetadata }
  >();
  private metadataCacheVersion = 0;
  private catalogCareerLookup = new Map<string, string>();

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
  protected readonly formAnswers = signal<Map<number, string[]>>(new Map());
  protected readonly formAnswerErrors = signal<Map<number, Set<number>>>(new Map());
  protected readonly filteredOffers = computed(() => this.applyOfferFilters());
  protected readonly selectedCareerCategories = signal<Set<string>>(new Set());
  protected readonly selectedModalities = signal<Set<OfferModality>>(new Set());
  protected readonly selectedRegions = signal<Set<string>>(new Set());
  protected readonly expandedFilter = signal<FilterKey | null>(null);
  protected readonly careerCategoryOptions = computed(() => this.buildCareerCategoryOptions());
  protected readonly modalityOptions = MODALITY_OPTIONS;
  protected readonly regionOptions = REGION_FILTER_OPTIONS;
  protected readonly filterMenuIds = FILTER_MENU_IDS;
  protected readonly catalogCareerCategories = signal<string[]>([]);
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
    void this.loadCareerCatalog();
  }

  protected trackByOfferId(_: number, offer: PublicOffer): number {
    return offer?.id ?? _;
  }

  protected trackByQuestionIndex(index: number): number {
    return index;
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

  protected getAnswerValue(offerId: number, questionIndex: number): string {
    return this.formAnswers().get(offerId)?.[questionIndex] ?? '';
  }

  protected handleAnswerInput(offer: PublicOffer, questionIndex: number, value: string): void {
    if (!offer?.id) {
      return;
    }

    this.formAnswers.update((answers) => {
      const next = new Map(answers);
      const current = [...(next.get(offer.id) ?? [])];
      current[questionIndex] = value;
      next.set(offer.id, current);
      return next;
    });

    const question = offer.questions?.[questionIndex];

    if (question?.required && value.trim()) {
      this.formAnswerErrors.update((errors) => {
        const next = new Map(errors);
        const current = new Set(next.get(offer.id) ?? []);
        current.delete(questionIndex);

        if (current.size === 0) {
          next.delete(offer.id);
        } else {
          next.set(offer.id, current);
        }

        return next;
      });
    }
  }

  protected hasAnswerError(offerId: number, questionIndex: number): boolean {
    return this.formAnswerErrors().get(offerId)?.has(questionIndex) ?? false;
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

    for (const catalogCategory of this.catalogCareerCategories()) {
      const label = formatDisplayLabel(catalogCategory);

      if (!label) {
        continue;
      }

      const key = normalizeLookup(label);

      if (key && !categories.has(key)) {
        categories.set(key, label);
      }
    }

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
    const cached = this.offerMetadataCache.get(offer);

    if (cached && cached.version === this.metadataCacheVersion) {
      return cached.metadata;
    }

    const metadata: OfferFilterMetadata = {
      category: this.computeOfferCategory(offer),
      region: this.computeOfferRegion(offer),
      modality: this.computeOfferModality(offer)
    };

    this.offerMetadataCache.set(offer, { version: this.metadataCacheVersion, metadata });

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

    const formattedCategory = formatDisplayLabel(rawCategory);

    if (formattedCategory) {
      return formattedCategory;
    }

    const careerCandidates = [
      offer.seniority,
      offer.career,
      this.readStringField(offer, 'careerName', 'carrera', 'especialidad', 'career')
    ];

    for (const candidate of careerCandidates) {
      const category = this.lookupCareerCategory(candidate);

      if (category) {
        return category;
      }
    }

    return null;
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

  private lookupCareerCategory(career: string | null | undefined): string | null {
    const normalized = normalizeLookup(career);

    if (!normalized) {
      return null;
    }

    return this.catalogCareerLookup.get(normalized) ?? null;
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

    const { answers, missingIndexes } = this.buildApplicationAnswers(offer);

    if (missingIndexes.length > 0) {
      this.setAnswerErrors(offer.id, missingIndexes);
      this.globalMessage.set(null);
      this.applicationErrors.update((errors) => {
        const next = new Map(errors);
        next.set(offer.id, 'Responde todas las preguntas obligatorias antes de postular.');
        return next;
      });
      return;
    }

    this.setAnswerErrors(offer.id, []);

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
      await firstValueFrom(this.offersService.applyToOffer(offer.id, coverLetter, answers));

      this.appliedOffers.update((set) => {
        const next = new Set(set);
        next.add(offer.id);
        return next;
      });

      this.clearOfferFormState(offer.id);

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

  private buildApplicationAnswers(
    offer: PublicOffer
  ): { answers: ApplicantAnswer[] | undefined; missingIndexes: number[] } {
    const questions = Array.isArray(offer?.questions) ? offer.questions : [];

    if (!offer?.id || questions.length === 0) {
      return { answers: undefined, missingIndexes: [] };
    }

    const storedAnswers = this.formAnswers().get(offer.id) ?? [];
    const normalized: ApplicantAnswer[] = [];
    const missing: number[] = [];

    questions.forEach((question, index) => {
      const response = (storedAnswers[index] ?? '').trim();

      if (question.required && !response) {
        missing.push(index);
        return;
      }

      if (response) {
        normalized.push({ question: question.text, answer: response });
      }
    });

    return {
      answers: normalized.length > 0 ? normalized : undefined,
      missingIndexes: missing
    };
  }

  private setAnswerErrors(offerId: number, indexes: number[]): void {
    if (!offerId) {
      return;
    }

    this.formAnswerErrors.update((errors) => {
      const next = new Map(errors);

      if (indexes.length === 0) {
        next.delete(offerId);
        return next;
      }

      next.set(offerId, new Set(indexes));
      return next;
    });
  }

  private clearOfferFormState(offerId: number): void {
    if (!offerId) {
      return;
    }

    this.formAnswers.update((answers) => {
      const next = new Map(answers);
      next.delete(offerId);
      return next;
    });

    this.setAnswerErrors(offerId, []);
  }

  private async loadOffers(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const offers = await firstValueFrom(this.offersService.listOffers());
      this.offers.set(offers);
      this.invalidateOfferMetadataCache();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudieron obtener las ofertas disponibles.';
      this.error.set(message);
      this.offers.set([]);
      this.invalidateOfferMetadataCache();
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

  private async loadCareerCatalog(): Promise<void> {
    try {
      const careerMap = await firstValueFrom(this.profileFieldsService.getCareerMap());
      this.applyCareerCatalog(careerMap);
    } catch (error) {
      console.error('[Home] Failed to load career catalog', error);
      this.catalogCareerCategories.set([]);
      this.catalogCareerLookup = new Map<string, string>();
      this.invalidateOfferMetadataCache();
    }
  }

  private applyCareerCatalog(map: Record<string, readonly string[]>): void {
    const entries = Object.entries(map ?? {})
      .map(([category, careers]) => {
        const formattedCategory = formatDisplayLabel(category);

        if (!formattedCategory) {
          return null;
        }

        const formattedCareers = (careers ?? [])
          .map((career) => formatDisplayLabel(career))
          .filter((career): career is string => Boolean(career));

        return { category: formattedCategory, careers: formattedCareers };
      })
      .filter((entry): entry is { category: string; careers: string[] } => Boolean(entry));

    entries.sort((a, b) => a.category.localeCompare(b.category, 'es'));

    const lookup = new Map<string, string>();

    for (const entry of entries) {
      for (const career of entry.careers) {
        const normalizedCareer = normalizeLookup(career);

        if (normalizedCareer && !lookup.has(normalizedCareer)) {
          lookup.set(normalizedCareer, entry.category);
        }
      }
    }

    this.catalogCareerLookup = lookup;
    this.catalogCareerCategories.set(entries.map((entry) => entry.category));
    this.invalidateOfferMetadataCache();
  }

  private invalidateOfferMetadataCache(): void {
    this.metadataCacheVersion = (this.metadataCacheVersion + 1) % Number.MAX_SAFE_INTEGER;
  }
}
