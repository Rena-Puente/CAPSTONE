import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { Subscription, firstValueFrom } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import {
  ProfileService,
  PublicProfileData,
  GithubRepositoryPreview,
  GithubLanguageSegment
} from '../../../services/profile.service';

@Component({
  selector: 'app-public-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './public-profile.html',
  styleUrl: './public-profile.css'
})
export class PublicProfile implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly profileService = inject(ProfileService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private slugSubscription: Subscription | null = null;
  private lastGithubSlug: string | null = null;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly profile = signal<PublicProfileData | null>(null);
  protected readonly githubDataLoading = signal(false);
  protected readonly githubDataError = signal<string | null>(null);
  protected readonly githubRepositories = signal<GithubRepositoryPreview[]>([]);
  protected readonly githubLanguages = signal<GithubLanguageSegment[]>([]);
  protected readonly githubTopRepositories = computed(() => {
    const repositories = this.githubRepositories();

    return repositories
      .filter((repo) => Boolean(repo && repo.name))
      .slice()
      .sort((a, b) => {
        const starDiff = (b?.stars ?? 0) - (a?.stars ?? 0);

        if (starDiff !== 0) {
          return starDiff;
        }

        const forkDiff = (b?.forks ?? 0) - (a?.forks ?? 0);

        if (forkDiff !== 0) {
          return forkDiff;
        }

        return (a?.name ?? '').localeCompare(b?.name ?? '', 'es', { sensitivity: 'base' });
      })
      .slice(0, 6);
  });
  protected readonly githubLanguageBreakdown = computed(() => {
    const segments = this.githubLanguages();

    if (!segments || segments.length === 0) {
      return [] as Array<GithubLanguageSegment & { percentage: number }>;
    }

    const sanitized = segments.map((segment) => {
      const value = Number.isFinite(segment?.value) ? Math.max(segment.value, 0) : 0;
      const percentage =
        segment?.percentage !== null && Number.isFinite(segment?.percentage)
          ? Math.max(segment.percentage ?? 0, 0)
          : null;

      return {
        name: segment?.name ?? '',
        color: segment?.color ?? null,
        value,
        percentage
      } satisfies GithubLanguageSegment;
    });

    const totalValue = sanitized.reduce((acc, segment) => acc + (segment.value ?? 0), 0);

    const computedSegments = sanitized.map((segment) => {
      const base =
        segment.percentage !== null
          ? segment.percentage
          : totalValue > 0
            ? (segment.value / totalValue) * 100
            : 0;
      const safe = Number.isFinite(base) ? Math.max(base, 0) : 0;

      return {
        name: segment.name,
        color: segment.color ?? null,
        value: segment.value,
        percentage: safe
      } satisfies GithubLanguageSegment & { percentage: number };
    });

    const sum = computedSegments.reduce((acc, segment) => acc + segment.percentage, 0);

    if (computedSegments.length > 0 && sum > 0) {
      const difference = 100 - sum;
      const lastIndex = computedSegments.length - 1;
      computedSegments[lastIndex] = {
        ...computedSegments[lastIndex],
        percentage: Math.max(computedSegments[lastIndex].percentage + difference, 0)
      } satisfies GithubLanguageSegment & { percentage: number };
    }

    return computedSegments.map((segment) => ({
      ...segment,
      percentage: Number.isFinite(segment.percentage)
        ? Math.max(Math.min(segment.percentage, 100), 0)
        : 0
    }));
  });
  protected readonly showGithubRepositories = computed(
    () => this.githubTopRepositories().length > 0 && !this.githubDataLoading()
  );
  protected readonly showGithubLanguages = computed(
    () => this.githubLanguageBreakdown().length > 0 && !this.githubDataLoading()
  );
  protected readonly hasGithubInsights = computed(
    () => this.showGithubRepositories() || this.showGithubLanguages()
  );
  protected readonly githubLanguagesAriaLabel = computed(() => {
    const breakdown = this.githubLanguageBreakdown();

    if (breakdown.length === 0) {
      return 'No hay lenguajes de GitHub disponibles.';
    }

    const parts = breakdown.map((segment) => `${segment.name}: ${segment.percentage.toFixed(1)}%`);
    return `Distribución de lenguajes en GitHub. ${parts.join(', ')}.`;
  });
  protected readonly publicProfileBaseUrl = this.resolvePublicProfileBaseUrl();
  protected readonly publicProfileUrl = computed(() => {
    const data = this.profile();

    if (!data?.profile.slug) {
      return null;
    }

    return `${this.publicProfileBaseUrl}${data.profile.slug}`;
  });

  ngOnInit(): void {
    this.slugSubscription = this.route.paramMap
      .pipe(
        map((params) => params.get('slug')),
        distinctUntilChanged()
      )
      .subscribe((slug) => {
        void this.fetchPublicProfile(slug);
      });
  }

  ngOnDestroy(): void {
    this.slugSubscription?.unsubscribe();
    this.slugSubscription = null;
  }

  protected trackByEducationId = (_: number, item: PublicProfileData['education']['entries'][number]) =>
    item.id;

  protected trackByExperienceId = (_: number, item: PublicProfileData['experience']['entries'][number]) =>
    item.id;

  protected trackBySkillId = (_: number, item: PublicProfileData['skills']['entries'][number]) =>
    item.id;
  protected trackByGithubRepoId = (_: number, item: GithubRepositoryPreview) => item.id;
  protected trackByGithubLanguageName = (
    _: number,
    item: GithubLanguageSegment & { percentage: number }
  ) => item.name;
  protected joinDefined(
    values: ReadonlyArray<string | null | undefined>,
    separator: string,
    fallback = ''
  ): string {
    const filtered = values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (filtered.length === 0) {
      return fallback;
    }

    return filtered.join(separator);
  }


  private async fetchPublicProfile(slugParam: string | null): Promise<void> {
    const slug = typeof slugParam === 'string' ? slugParam.trim().toLowerCase() : '';

    if (!slug) {
      const message = 'La URL proporcionada no es válida.';
      this.profile.set(null);
      this.error.set(message);
      this.loading.set(false);
      this.resetGithubInsights();
      this.updateSeoForError(message);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.profile.set(null);
    this.resetGithubInsights();

    try {
      const data = await firstValueFrom(this.profileService.getPublicProfile(slug));
      this.profile.set(data);
      this.loading.set(false);
      this.githubRepositories.set(data.githubRepositories ?? []);
      this.githubLanguages.set(data.githubLanguages ?? []);
      this.updateSeoForProfile(data);
      void this.fetchGithubInsights(slug);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo cargar el perfil público.';
      this.profile.set(null);
      this.loading.set(false);
      this.error.set(message);
      this.resetGithubInsights();
      this.updateSeoForError(message);
    }
  }

  private async fetchGithubInsights(slug: string): Promise<void> {
    const normalized = typeof slug === 'string' ? slug.trim().toLowerCase() : '';

    if (!normalized) {
      this.resetGithubInsights();
      return;
    }

    if (this.lastGithubSlug === normalized && (this.githubRepositories().length > 0 || this.githubLanguages().length > 0)) {
      return;
    }

    this.githubDataLoading.set(true);
    this.githubDataError.set(null);

    try {
      const result = await firstValueFrom(
        this.profileService.getPublicGithubRepositories(normalized)
      );
      this.githubRepositories.set(result.repositories ?? []);
      this.githubLanguages.set(result.languages ?? []);
      this.lastGithubSlug = normalized;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo obtener la actividad pública de GitHub.';
      this.githubDataError.set(message);
      this.githubRepositories.set([]);
      this.githubLanguages.set([]);
      this.lastGithubSlug = null;
    } finally {
      this.githubDataLoading.set(false);
    }
  }

  private updateSeoForProfile(data: PublicProfileData): void {
    const displayName = data.profile.displayName?.trim();
    const headline = data.profile.career?.trim();
    const biography = data.profile.biography?.trim();
    const titleText = displayName
      ? `Perfil de ${displayName} | InfoTex`
      : 'Perfil profesional | InfoTex';

    const descriptionParts = [
      biography && biography.length > 0
        ? biography
        : 'Explora la trayectoria profesional publicada en InfoTex.',
      headline && headline.length > 0 ? `Especialidad: ${headline}.` : null,
      data.skills.entries.length > 0
        ? `Habilidades destacadas: ${data.skills.entries
            .slice(0, 4)
            .map((entry) => entry.name)
            .join(', ')}.`
        : null
    ].filter((value): value is string => Boolean(value && value.trim().length > 0));

    const description = descriptionParts.join(' ');

    this.title.setTitle(titleText);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: titleText });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ name: 'twitter:title', content: titleText });
    this.meta.updateTag({ name: 'twitter:description', content: description });

    const url = this.publicProfileUrl();
    if (url) {
      this.meta.updateTag({ property: 'og:url', content: url });
      this.meta.updateTag({ name: 'twitter:url', content: url });
    }
  }

  private updateSeoForError(message: string): void {
    const normalized = message.toLowerCase();
    const isNotFound = normalized.includes('no se encontró') || normalized.includes('no es válida');
    const titleText = isNotFound ? 'Perfil no encontrado | InfoTex' : 'Perfil no disponible | InfoTex';
    const description = isNotFound
      ? 'No pudimos encontrar el perfil público solicitado en InfoTex.'
      : 'Ocurrió un inconveniente al mostrar el perfil público solicitado.';

    this.title.setTitle(titleText);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: titleText });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ name: 'twitter:title', content: titleText });
    this.meta.updateTag({ name: 'twitter:description', content: description });
  }

  private resolvePublicProfileBaseUrl(): string {
    const locationRef = this.document?.location ?? (typeof window !== 'undefined' ? window.location : null);
    const origin = locationRef?.origin ?? '';
    const normalizedOrigin = origin ? origin.replace(/\/$/, '') : '';

    if (!normalizedOrigin) {
      return '/user/';
    }

    return `${normalizedOrigin}/user/`;
  }

  private resetGithubInsights(): void {
    this.githubDataLoading.set(false);
    this.githubDataError.set(null);
    this.githubRepositories.set([]);
    this.githubLanguages.set([]);
    this.lastGithubSlug = null;
  }
}
