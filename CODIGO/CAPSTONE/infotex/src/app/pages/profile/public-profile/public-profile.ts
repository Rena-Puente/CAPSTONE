import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { Subscription, firstValueFrom } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { ProfileService, PublicProfileData } from '../../../services/profile.service';

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

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly profile = signal<PublicProfileData | null>(null);
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
      this.updateSeoForError(message);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.profile.set(null);

    try {
      const data = await firstValueFrom(this.profileService.getPublicProfile(slug));
      this.profile.set(data);
      this.loading.set(false);
      this.updateSeoForProfile(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo cargar el perfil público.';
      this.profile.set(null);
      this.loading.set(false);
      this.error.set(message);
      this.updateSeoForError(message);
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
}
