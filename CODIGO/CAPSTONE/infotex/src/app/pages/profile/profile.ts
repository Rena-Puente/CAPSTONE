import { CommonModule, DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { Subscription, firstValueFrom, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';

import { AuthService } from '../../services/auth.service';
import {
  GITHUB_LINK_FEEDBACK_KEY,
  PROFILE_FIELDS,
  ProfileData,
  ProfileField,
  ProfileService,
  UpdateProfilePayload,
  EducationEntry,
  EducationPayload,
  EducationSummary,
  ExperienceEntry,
  ExperiencePayload,
  ExperienceSummary,
  SkillCatalogItem,
  SkillEntry,
  SkillPayload,
  SkillSummary,
  GithubAccountStatus,
  GithubAccountResponse,
  GithubRepositoryPreview,
  GithubLanguageSegment
} from '../../services/profile.service';

import { ProfileFieldsService } from '../../services/profilefields.service';

function minTrimmedLengthValidator(minLength: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';

    if (value.length < minLength) {
      return { minTrimmedLength: { requiredLength: minLength, actualLength: value.length } };
    }

    return null;
  };
}

type FieldState = Record<ProfileField, { ok: boolean; error: string | null }>;
type ProfileSectionKey = 'overview' | 'biography' | 'education' | 'experience' | 'skills' | 'github';

function createEmptyFieldState(): FieldState {
  return PROFILE_FIELDS.reduce((acc, field) => {
    acc[field] = { ok: true, error: null };
    return acc;
  }, {} as FieldState);
}

const DEFAULT_COUNTRY = 'Chile';
const FALLBACK_CAREER_CATEGORY = 'Otras carreras';
const FALLBACK_SKILL_CATEGORY = 'Otras habilidades';
const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;
type SlugAvailabilityStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid' | 'error';
type PublicLinkFeedback = { type: 'success' | 'error'; message: string };

const OTHER_INSTITUTION_OPTION = '__other__';

const DEFAULT_GITHUB_ACCOUNT: GithubAccountStatus = {
  linked: false,
  username: null,
  profileUrl: null,
  providerId: null,
  lastSyncedAt: null
};

type GithubLanguageDisplaySegment = GithubLanguageSegment & { percentage: number };

type CareerOptionGroup = { name: string; options: readonly string[] };

type AlertContent = { text: string } | { html: string };
type AlertType = 'success' | 'warning' | 'danger';

const DEFAULT_EXPANDED_SECTIONS: Record<ProfileSectionKey, boolean> = {
  overview: true,
  biography: false,
  education: false,
  experience: false,
  skills: false,
  github: false
};

function avatarUrlValidator(): ValidatorFn {
  const relativePathPattern = /^\/[\w\-./]+$/;

  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';

    if (!value) {
      return null;
    }

    if (relativePathPattern.test(value)) {
      return null;
    }

    try {
      const url = new URL(value);

      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return null;
      }
    } catch (error) {
      // Ignore parsing errors and fall through to the invalidAvatarUrl return value.
    }

    return { invalidAvatarUrl: true };
  };
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit, AfterViewInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly PFService = inject(ProfileFieldsService);
  private readonly document = inject(DOCUMENT);

  private slugAvailabilitySubscription: Subscription | null = null;
  private educationInstitutionSubscription: Subscription | null = null;

  @ViewChild('alertPlaceholder', { static: true })
  private alertPlaceholderRef?: ElementRef<HTMLDivElement>;

  private readonly activeAlerts = new Map<string, HTMLElement>();
  private alertEffectsInitialized = false;

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly submitError = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly profile = signal<ProfileData | null>(null);
  protected readonly fieldState = signal<FieldState>(createEmptyFieldState());
  protected readonly editorOpen = signal(false);
  protected readonly avatarHasError = signal(false);
  protected readonly avatarSelectorOpen = signal(false);
  protected readonly expandedSections = signal<Record<ProfileSectionKey, boolean>>({
    ...DEFAULT_EXPANDED_SECTIONS
  });
  protected readonly education = signal<EducationEntry[]>([]);
  protected readonly educationSummary = signal<EducationSummary | null>(null);
  protected readonly educationLoading = signal(false);
  protected readonly educationError = signal<string | null>(null);
  protected readonly educationEditorOpen = signal(false);
  protected readonly educationSaving = signal(false);
  protected readonly educationSubmitError = signal<string | null>(null);
  protected readonly editingEducationId = signal<number | null>(null);
  protected readonly educationDeletingId = signal<number | null>(null);
  protected readonly institutionOptions = signal<string[]>([]);
  protected readonly institutionsLoading = signal(false);
  protected readonly institutionsError = signal<string | null>(null);
  protected readonly otherInstitutionOption = OTHER_INSTITUTION_OPTION;
  protected readonly experience = signal<ExperienceEntry[]>([]);
  protected readonly experienceSummary = signal<ExperienceSummary | null>(null);
  protected readonly experienceLoading = signal(false);
  protected readonly experienceError = signal<string | null>(null);
  protected readonly experienceEditorOpen = signal(false);
  protected readonly experienceSaving = signal(false);
  protected readonly experienceSubmitError = signal<string | null>(null);
  protected readonly editingExperienceId = signal<number | null>(null);
  protected readonly experienceDeletingId = signal<number | null>(null);
  protected readonly skills = signal<SkillEntry[]>([]);
  protected readonly skillsSummary = signal<SkillSummary | null>(null);
  protected readonly skillsLoading = signal(false);
  protected readonly skillsError = signal<string | null>(null);
  protected readonly skillsEditorOpen = signal(false);
  protected readonly skillsSaving = signal(false);
  protected readonly skillsSubmitError = signal<string | null>(null);
  protected readonly editingSkillId = signal<number | null>(null);
  protected readonly skillsDeletingId = signal<number | null>(null);
  protected readonly skillCatalog = signal<SkillCatalogItem[]>([]);
  protected readonly skillCatalogLoading = signal(false);
  protected readonly skillCatalogError = signal<string | null>(null);
  protected readonly slugAvailabilityStatus = signal<SlugAvailabilityStatus>('idle');
  protected readonly slugAvailabilityMessage = signal<string | null>(null);
  protected readonly publicLinkFeedback = signal<PublicLinkFeedback | null>(null);
  protected readonly skillCatalogGroups = computed(() => {
    const groups = new Map<string, SkillCatalogItem[]>();
    const fallbackCategory = FALLBACK_SKILL_CATEGORY;

    for (const item of this.skillCatalog()) {
      if (!item || !item.name) {
        continue;
      }

      const category = item.category?.trim() || fallbackCategory;
      const list = groups.get(category) ?? [];
      list.push(item);
      groups.set(category, list);
    }

    return Array.from(groups.entries())
      .map(([category, items]) => ({
        category,
        items: items
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
      }))
      .sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));
  });
  protected readonly cityOptions = signal<string[]>([]);
  protected readonly citiesLoading = signal(false);
  protected readonly citiesError = signal<string | null>(null);
  protected readonly careerOptionsByCategory = signal<Record<string, string[]>>({});
  protected readonly careerCategories = signal<string[]>([]);
  protected readonly careerCategoryOptions = computed<CareerOptionGroup[]>(() =>
    this.careerCategories()
      .map((category) => ({
        name: category,
        options: this.careerOptionsByCategory()[category] ?? []
      }))
      .filter((group) => group.options.length > 0)
  );
  protected readonly careersLoading = signal(false);
  protected readonly careersError = signal<string | null>(null);

  protected readonly defaultAvatars = [
    { label: 'Avatar 1', url: '/avatars/avatar1.png' },
    { label: 'Avatar 2', url: '/avatars/avatar2.png' },
    { label: 'Avatar 3', url: '/avatars/avatar3.png' },
    { label: 'Avatar 4', url: '/avatars/avatar4.png' },
    { label: 'Avatar 5', url: '/avatars/avatar5.png' },
    { label: 'Avatar 6', url: '/avatars/avatar6.png' },
    { label: 'Avatar 7', url: '/avatars/avatar7.png' },
    { label: 'Avatar 8', url: '/avatars/avatar8.png' },
    { label: 'Avatar 9', url: '/avatars/avatar9.png' },
    { label: 'Avatar 10', url: '/avatars/avatar10.png' },
    { label: 'Avatar 11', url: '/avatars/avatar11.png' },
    { label: 'Avatar 12', url: '/avatars/avatar12.png' }
  ];

  protected readonly isComplete = computed(() => this.profile()?.isComplete ?? false);
  protected readonly missingFields = computed(() => this.profile()?.missingFields ?? []);
  protected readonly defaultCountry = DEFAULT_COUNTRY;
  protected readonly publicProfileBaseUrl = this.resolvePublicProfileBaseUrl();
  protected readonly publicProfileUrl = computed(() => {
    const slug = this.profile()?.slug;

    if (!slug) {
      return null;
    }

    return `${this.publicProfileBaseUrl}${slug}`;
  });
  protected readonly githubAccount = computed<GithubAccountStatus>(() => {
    const account = this.profile()?.githubAccount;

    if (!account) {
      return { ...DEFAULT_GITHUB_ACCOUNT };
    }

    return {
      linked: Boolean(account.linked),
      username: account.username ?? null,
      profileUrl: account.profileUrl ?? (account.username ? `https://github.com/${account.username}` : null),
      providerId: account.providerId ?? null,
      lastSyncedAt: account.lastSyncedAt ?? null
    } satisfies GithubAccountStatus;
  });
  protected readonly githubLinkLoading = signal(false);
  protected readonly githubUnlinkLoading = signal(false);
  protected readonly githubErrorMessage = signal<string | null>(null);
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
  protected readonly githubLanguageBreakdown = computed<GithubLanguageDisplaySegment[]>(() => {
    const segments = this.githubLanguages();

    if (!segments || segments.length === 0) {
      return [];
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

    const computed = sanitized.map((segment) => {
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
      } satisfies GithubLanguageDisplaySegment;
    });

    const sum = computed.reduce((acc, segment) => acc + segment.percentage, 0);

    if (computed.length > 0 && sum > 0) {
      const difference = 100 - sum;
      const lastIndex = computed.length - 1;
      computed[lastIndex] = {
        ...computed[lastIndex],
        percentage: Math.max(computed[lastIndex].percentage + difference, 0)
      } satisfies GithubLanguageDisplaySegment;
    }

    return computed.map((segment) => ({
      ...segment,
      percentage: Number.isFinite(segment.percentage)
        ? Math.max(Math.min(segment.percentage, 100), 0)
        : 0
    }));
  });
  protected readonly showGithubRepositories = computed(
    () => this.githubAccount().linked && this.githubTopRepositories().length > 0 && !this.githubDataLoading()
  );
  protected readonly showGithubLanguages = computed(
    () => this.githubAccount().linked && this.githubLanguageBreakdown().length > 0 && !this.githubDataLoading()
  );
  protected readonly githubLanguagesAriaLabel = computed(() => {
    const breakdown = this.githubLanguageBreakdown();

    if (breakdown.length === 0) {
      return 'No hay lenguajes de GitHub disponibles.';
    }

    const parts = breakdown.map((segment) => `${segment.name}: ${segment.percentage.toFixed(1)}%`);
    return `Distribución de lenguajes en GitHub. ${parts.join(', ')}.`;
  });
  protected readonly hasGithubInsights = computed(
    () => this.githubAccount().linked && (this.showGithubRepositories() || this.showGithubLanguages())
  );
  protected readonly trackByRepositoryId = (_: number, repo: GithubRepositoryPreview) => repo.id;
  protected readonly trackByLanguageName = (_: number, segment: GithubLanguageDisplaySegment) => segment.name;

  private fetchedGithubForUsername: string | null = null;
  private readonly githubAccountWatcher = effect(() => {
    this.handleGithubAccountChange(this.githubAccount());
  });

  protected readonly profileForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required]],
    biography: ['', [Validators.required, minTrimmedLengthValidator(80)]],
    country: [DEFAULT_COUNTRY, [Validators.required]],
    city: ['', [Validators.required]],
    career: ['', [Validators.required]],
    avatarUrl: ['', [Validators.required, avatarUrlValidator()]],
    slug: ['', [Validators.required, Validators.pattern(SLUG_PATTERN)]]

  });

  protected readonly educationForm = this.fb.nonNullable.group({
    institution: ['', [Validators.required]],
    institutionOther: [''],
    degree: [''],
    fieldOfStudy: [''],
    startDate: [''],
    endDate: [''],
    description: ['']
  });

  protected readonly experienceForm = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    company: [''],
    startDate: [''],
    endDate: [''],
    location: [''],
    description: ['']
  });

  protected readonly skillForm = this.fb.group({
    skillId: [null as number | null, [Validators.required]],
    level: [''],
    yearsExperience: [''],
    endorsementCount: ['']
  });

  ngAfterViewInit(): void {
    this.initializeAlertEffects();
  }

  ngOnDestroy(): void {
    this.slugAvailabilitySubscription?.unsubscribe();
    this.slugAvailabilitySubscription = null;
    this.educationInstitutionSubscription?.unsubscribe();
    this.educationInstitutionSubscription = null;
  }

  async ngOnInit(): Promise<void> {
    this.observeSlugChanges();
    const institutionControl = this.educationForm.controls.institution;
    this.educationInstitutionSubscription?.unsubscribe();
    this.educationInstitutionSubscription = institutionControl.valueChanges
      .pipe(startWith(institutionControl.value))
      .subscribe((value) => this.handleEducationInstitutionChange(value));
    await Promise.all([
      this.loadCities(),
      this.loadCareers(),
      this.loadInstitutions(),
      this.loadSkillCatalog()
    ]);
    await this.loadProfile();
    await Promise.all([this.loadEducation(), this.loadExperience(), this.loadSkills()]);
    this.initializeAlertEffects();
  }

  protected async retry(): Promise<void> {
    await this.loadProfile();
    await Promise.all([
      this.loadEducation(),
      this.loadExperience(),
      this.loadSkills(),
      this.loadSkillCatalog(),
      this.loadInstitutions()
    ]);
  }

  protected openEditor(): void {
    if (this.loading()) {
      return;
    }

    this.editorOpen.set(true);
    this.profileForm.enable({ emitEvent: false });
  }

  protected toggleSection(section: ProfileSectionKey): void {
    this.expandedSections.update((state) => ({
      ...state,
      [section]: !state[section]
    }));
  }

  private observeSlugChanges(): void {
    const control = this.slugControl;

    this.slugAvailabilitySubscription?.unsubscribe();

    type SlugEvent =
      | { type: 'empty' }
      | { type: 'invalid' }
      | { type: 'current' }
      | { type: 'result'; available: boolean }
      | { type: 'error'; message: string | null };

    this.slugAvailabilitySubscription = control.valueChanges
      .pipe(
        startWith(control.value),
        map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')),
        distinctUntilChanged(),
        switchMap((value) => {
          if (!value) {
            this.slugAvailabilityStatus.set('idle');
            this.slugAvailabilityMessage.set(null);
            return of<SlugEvent>({ type: 'empty' });
          }

          if (control.invalid) {
            this.slugAvailabilityStatus.set('invalid');
            this.slugAvailabilityMessage.set(null);
            return of<SlugEvent>({ type: 'invalid' });
          }

          const currentSlug = this.profile()?.slug?.trim().toLowerCase() ?? '';

          if (currentSlug && currentSlug === value) {
            this.slugAvailabilityStatus.set('available');
            this.slugAvailabilityMessage.set('Esta es tu URL actual.');
            return of<SlugEvent>({ type: 'current' });
          }

          this.slugAvailabilityStatus.set('checking');
          this.slugAvailabilityMessage.set(null);

          return of(value).pipe(
            debounceTime(300),
            switchMap(() =>
              this.profileService.checkSlugAvailability(value).pipe(
                map((available): SlugEvent => ({ type: 'result', available })),
                catchError((error) =>
                  of<SlugEvent>({
                    type: 'error',
                    message: error instanceof Error ? error.message : null
                  })
                )
              )
            )
          );
        })
      )
      .subscribe((event) => {
        this.publicLinkFeedback.set(null);

        switch (event.type) {
          case 'empty':
            this.slugAvailabilityStatus.set('idle');
            this.slugAvailabilityMessage.set(null);
            break;
          case 'invalid':
            this.slugAvailabilityStatus.set('invalid');
            this.slugAvailabilityMessage.set(null);
            break;
          case 'current':
            this.slugAvailabilityStatus.set('available');
            this.slugAvailabilityMessage.set('Esta es tu URL actual.');
            break;
          case 'result':
            if (event.available) {
              this.slugAvailabilityStatus.set('available');
              this.slugAvailabilityMessage.set('Esta URL está disponible.');
            } else {
              this.slugAvailabilityStatus.set('unavailable');
              this.slugAvailabilityMessage.set('Esta URL ya está en uso. Elige otra diferente.');
            }
            break;
          case 'error':
            this.slugAvailabilityStatus.set('error');
            this.slugAvailabilityMessage.set(
              event.message ?? 'No se pudo verificar la disponibilidad de la URL personalizada.'
            );
            break;
        }
      });
  }

  private initializeAlertEffects(): void {
    if (this.alertEffectsInitialized) {
      return;
    }

    if (!this.alertPlaceholderRef?.nativeElement) {
      return;
    }

    this.alertEffectsInitialized = true;

    effect(() => {
      this.updateAlert('load-error', this.loadError(), 'danger');
    });

    effect(() => {
      this.updateAlert('submit-error', this.submitError(), 'danger');
    });

    effect(() => {
      this.updateAlert('success-message', this.successMessage(), 'success');
    });

    effect(() => {
      const profile = this.profile();

      if (!profile) {
        this.dismissAlert('profile-status');
        return;
      }

      if (profile.isComplete) {
        this.updateAlert('profile-status', { text: '¡Tu perfil está completo! Excelente trabajo.' }, 'success');
        return;
      }

      const missing = this.missingFields();
      const listItems = missing
        .map((item) => `<li>${this.escapeHtml(item)}</li>`)
        .join('');
      const messageHtml = [
        'Tu perfil aún no está completo. Completa los siguientes elementos para finalizarlo:',
        listItems ? `<ul class="mb-0 mt-2">${listItems}</ul>` : ''
      ]
        .filter(Boolean)
        .join('');

      this.updateAlert('profile-status', { html: messageHtml }, 'warning');
    });
  }

  private updateAlert(key: string, content: string | AlertContent | null, type: AlertType): void {
    if (!this.alertPlaceholderRef?.nativeElement) {
      return;
    }

    if (content === null || content === undefined || (typeof content === 'string' && content.trim() === '')) {
      this.dismissAlert(key);
      return;
    }

    const placeholder = this.alertPlaceholderRef.nativeElement;
    const existing = this.activeAlerts.get(key);

    if (existing) {
      existing.remove();
      this.activeAlerts.delete(key);
    }

    const resolvedContent: AlertContent = typeof content === 'string' ? { text: content } : content;
    const messageMarkup = 'text' in resolvedContent ? this.escapeHtml(resolvedContent.text) : resolvedContent.html;

    if (!messageMarkup || messageMarkup.trim() === '') {
      this.dismissAlert(key);
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = [
      `<div class="alert alert-${type} alert-dismissible fade show" role="alert" data-alert-key="${key}">`,
      `  <div>${messageMarkup}</div>`,
      '  <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>',
      '</div>'
    ].join('');

    const alertElement = wrapper.firstElementChild as HTMLElement | null;

    if (!alertElement) {
      return;
    }

    alertElement.addEventListener('closed.bs.alert', () => {
      this.activeAlerts.delete(key);
    });

    placeholder.append(alertElement);
    this.activeAlerts.set(key, alertElement);
  }

  private dismissAlert(key: string): void {
    const element = this.activeAlerts.get(key);

    if (!element) {
      return;
    }

    this.activeAlerts.delete(key);

    if (element.parentElement) {
      element.parentElement.removeChild(element);
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }

  protected closeEditor(): void {
    if (!this.editorOpen()) {
      return;
    }

    this.editorOpen.set(false);
    this.publicLinkFeedback.set(null);

    const currentProfile = this.profile();

    if (currentProfile) {
      this.applyProfile(currentProfile);
    } else {
      this.profileForm.reset({
        displayName: '',
        biography: '',
        country: DEFAULT_COUNTRY,
        city: '',
        career: '',
        avatarUrl: '',
        slug: ''
      });
      this.profileForm.markAsPristine();
      this.profileForm.markAsUntouched();
    }

    this.profileForm.disable({ emitEvent: false });
  }

  protected handleAvatarError(): void {
    this.avatarHasError.set(true);
  }

  protected get displayNameControl() {
    return this.profileForm.controls.displayName;
  }

  protected get biographyControl() {
    return this.profileForm.controls.biography;
  }

  protected get countryControl() {
    return this.profileForm.controls.country;
  }

  protected get cityControl() {
    return this.profileForm.controls.city;
  }

  protected get careerControl() {
    return this.profileForm.controls.career;
  }

  protected get avatarUrlControl() {
    return this.profileForm.controls.avatarUrl;
  }

  protected get slugControl() {
    return this.profileForm.controls.slug;
  }

  protected openAvatarSelector(): void {
    if (this.profileForm.disabled) {
      return;
    }

    this.avatarSelectorOpen.set(true);
  }

  protected closeAvatarSelector(): void {
    this.avatarSelectorOpen.set(false);
  }

  protected selectDefaultAvatar(url: string): void {
    if (this.profileForm.disabled) {
      return;
    }

    this.avatarUrlControl.setValue(url);
    this.avatarUrlControl.markAsDirty();
    this.avatarUrlControl.markAsTouched();
    this.closeAvatarSelector();
  }

  protected isDefaultAvatarSelected(url: string): boolean {
    return this.avatarUrlControl.value === url;
  }

  protected async copyPublicProfileUrl(): Promise<void> {
    const url = this.publicProfileUrl();

    if (!url) {
      return;
    }

    this.publicLinkFeedback.set(null);

    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Copia el enlace manualmente desde la barra de direcciones.');
      }

      await navigator.clipboard.writeText(url);
      this.publicLinkFeedback.set({ type: 'success', message: 'Enlace copiado al portapapeles.' });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo copiar el enlace automáticamente. Copia la URL manualmente.';
      this.publicLinkFeedback.set({ type: 'error', message });
    }
  }

  protected async startGithubLink(): Promise<void> {
    if (this.githubLinkLoading()) {
      return;
    }

    this.githubErrorMessage.set(null);

    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
      this.githubErrorMessage.set('Tu navegador no soporta la autenticación segura con GitHub.');
      return;
    }

    const state = crypto.randomUUID();
    let redirected = false;

    this.githubLinkLoading.set(true);

    try {
      const authorizeUrl = await firstValueFrom(this.profileService.getGithubLinkAuthorizeUrl(state));
      const userId = this.authService.getUserId();

      if (!userId) {
        throw new Error('No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo nuevamente.');
      }

      if (!this.authService.storeGithubOAuthState({ state, mode: 'link', userId })) {
        throw new Error('No se pudo preparar la sesión segura. Habilita el almacenamiento de sesión e inténtalo de nuevo.');
      }

      redirected = true;
      window.location.href = authorizeUrl;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo iniciar la vinculación con GitHub. Vuelve a intentarlo más tarde.';
      this.githubErrorMessage.set(message);
    } finally {
      if (!redirected) {
        this.githubLinkLoading.set(false);
      }
    }
  }

  protected async unlinkGithubAccount(): Promise<void> {
    if (this.githubUnlinkLoading()) {
      return;
    }

    this.githubErrorMessage.set(null);
    this.githubUnlinkLoading.set(true);

    try {
      const response = await firstValueFrom(this.profileService.unlinkGithubAccount());
      this.setGithubAccount(response.account);
      this.successMessage.set(
        response.message || 'Tu cuenta de GitHub se desvinculó correctamente.'
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo desvincular tu cuenta de GitHub en este momento.';
      this.githubErrorMessage.set(message);
    } finally {
      this.githubUnlinkLoading.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.submitError.set(null);
    this.successMessage.set(null);

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const slugStatus = this.slugAvailabilityStatus();

    if (slugStatus === 'checking') {
      this.submitError.set('Espera a que validemos la disponibilidad de tu URL personalizada.');
      this.slugControl.markAsTouched();
      return;
    }

    if (slugStatus === 'unavailable') {
      this.submitError.set('La URL personalizada seleccionada ya está en uso. Elige otra antes de guardar.');
      this.slugControl.markAsTouched();
      return;
    }

    this.saving.set(true);
    this.profileForm.disable({ emitEvent: false });

    const rawValue = this.profileForm.getRawValue();
    const payload: UpdateProfilePayload = {
      displayName: rawValue.displayName.trim(),
      biography: rawValue.biography.trim(),
      country: rawValue.country.trim(),
      city: rawValue.city.trim(),
      career: rawValue.career.trim(),
      avatarUrl: rawValue.avatarUrl.trim(),
      slug: rawValue.slug.trim().toLowerCase()
    };

    try {
      const updatedProfile = await firstValueFrom(this.profileService.updateProfile(payload));
      this.applyProfile(updatedProfile);

      if (this.hasBackendErrors(updatedProfile)) {
        this.profileForm.markAllAsTouched();
        this.submitError.set(
          updatedProfile.message || 'Corrige la información resaltada e inténtalo nuevamente.'
        );
      } else {
        this.successMessage.set(updatedProfile.message || 'Los cambios se guardaron correctamente.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el perfil.';
      this.submitError.set(message);
    } finally {
      this.saving.set(false);
      this.profileForm.enable({ emitEvent: false });
    }
  }

  protected trackEducationById(index: number, item: EducationEntry): number {
    return item.id;
  }

  protected trackExperienceById(index: number, item: ExperienceEntry): number {
    return item.id;
  }

  protected trackSkillById(index: number, item: SkillEntry): number {
    return item.skillId;
  }

  protected trackInstitutionOption(index: number, option: string): string {
    return option;
  }

  protected educationInstitutionRequiresDetails(): boolean {
    return this.educationForm.controls.institution.value === OTHER_INSTITUTION_OPTION;
  }

  protected trackCityOption(index: number, option: string): string {
    return option;
  }

  protected trackCareerCategory(index: number, group: CareerOptionGroup): string {
    return group.name;
  }

  protected trackCareerOption(index: number, option: string): string {
    return option;
  }

  protected openEducationCreator(): void {
    this.editingEducationId.set(null);
    this.educationSubmitError.set(null);
    this.resetEducationForm();
    this.educationEditorOpen.set(true);
    this.educationForm.markAsPristine();
    this.educationForm.markAsUntouched();
  }

  protected editEducation(entry: EducationEntry): void {
    this.educationSubmitError.set(null);
    this.educationEditorOpen.set(true);
    this.editingEducationId.set(entry.id);
    this.educationForm.setValue({
      institution: this.normalizeInstitution(entry.institution),
      institutionOther: '',
      degree: entry.degree ?? '',
      fieldOfStudy: entry.fieldOfStudy ?? '',
      startDate: entry.startDate ?? '',
      endDate: entry.endDate ?? '',
      description: entry.description ?? ''
    });
    this.educationForm.markAsPristine();
    this.educationForm.markAsUntouched();
  }

  protected cancelEducationEdit(): void {
        if (this.educationSaving()) {
      return;
    }


    this.educationEditorOpen.set(false);
    this.educationSubmitError.set(null);
    this.editingEducationId.set(null);
    this.resetEducationForm();
  }

  protected async saveEducation(): Promise<void> {
    this.educationSubmitError.set(null);

    if (this.educationForm.invalid) {
      this.educationForm.markAllAsTouched();
      return;
    }

    this.educationSaving.set(true);

    const raw = this.educationForm.getRawValue();
    const selectedInstitution =
      raw.institution === OTHER_INSTITUTION_OPTION
        ? raw.institutionOther.trim()
        : raw.institution.trim();

    const payload: EducationPayload = {
      institution: selectedInstitution,
      degree: raw.degree.trim() || null,
      fieldOfStudy: raw.fieldOfStudy.trim() || null,
      startDate: raw.startDate.trim() || null,
      endDate: raw.endDate.trim() || null,
      description: raw.description.trim() || null
    };

    const editingId = this.editingEducationId();
    let savedInstitution: string | null = null;

    try {
      if (editingId) {
        const response = await firstValueFrom(this.profileService.updateEducation(editingId, payload));
        this.educationSummary.set(response.educationSummary ?? null);
        this.education.update((items) =>
          this.sortEducationEntries(
            items.map((item) => (item.id === editingId ? response.education : item))
          )
        );
        savedInstitution = response.education?.institution ?? payload.institution;
      } else {
        const response = await firstValueFrom(this.profileService.createEducation(payload));
        this.educationSummary.set(response.educationSummary ?? null);
        this.education.update((items) =>
          this.sortEducationEntries([
            response.education,
            ...items.filter((item) => item.id !== response.education.id)
          ])
        );
        savedInstitution = response.education?.institution ?? payload.institution;
      }

      this.ensureInstitutionInOptions(savedInstitution);
      this.educationEditorOpen.set(false);
      this.editingEducationId.set(null);
      this.resetEducationForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo guardar la información educativa.';
      this.educationSubmitError.set(message);
    } finally {
      this.educationSaving.set(false);
    }
  }

  protected async deleteEducation(entry: EducationEntry): Promise<void> {
    if (!entry || this.educationDeletingId() === entry.id) {
      return;
    }

    const confirmed = window.confirm(
      `¿Deseas eliminar "${entry.institution}" de tu historial educativo?`
    );

    if (!confirmed) {
      return;
    }

    this.educationDeletingId.set(entry.id);
    this.educationSubmitError.set(null);

    try {
      const summary = await firstValueFrom(this.profileService.deleteEducation(entry.id));
      this.educationSummary.set(summary ?? null);
      this.education.update((items) => items.filter((item) => item.id !== entry.id));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo eliminar el registro educativo.';
      this.educationSubmitError.set(message);
    } finally {
      this.educationDeletingId.set(null);
    }
  }

  protected openExperienceCreator(): void {
    this.editingExperienceId.set(null);
    this.experienceSubmitError.set(null);
    this.resetExperienceForm();
    this.experienceEditorOpen.set(true);
    this.experienceForm.markAsPristine();
    this.experienceForm.markAsUntouched();
  }

  protected editExperience(entry: ExperienceEntry): void {
    this.experienceSubmitError.set(null);
    this.experienceEditorOpen.set(true);
    this.editingExperienceId.set(entry.id);
    this.experienceForm.setValue({
      title: entry.title ?? '',
      company: entry.company ?? '',
      startDate: entry.startDate ?? '',
      endDate: entry.endDate ?? '',
      location: entry.location ?? '',
      description: entry.description ?? ''
    });
    this.experienceForm.markAsPristine();
    this.experienceForm.markAsUntouched();
  }

  protected cancelExperienceEdit(): void {
    if (this.experienceSaving()) {
      return;
    }

    this.experienceEditorOpen.set(false);
    this.experienceSubmitError.set(null);
    this.editingExperienceId.set(null);
    this.resetExperienceForm();
  }

  protected async saveExperience(): Promise<void> {
    this.experienceSubmitError.set(null);

    if (this.experienceForm.invalid) {
      this.experienceForm.markAllAsTouched();
      return;
    }

    this.experienceSaving.set(true);

    const raw = this.experienceForm.getRawValue();
    const payload: ExperiencePayload = {
      title: raw.title.trim(),
      company: raw.company.trim() || null,
      startDate: raw.startDate.trim() || null,
      endDate: raw.endDate.trim() || null,
      location: raw.location.trim() || null,
      description: raw.description.trim() || null
    };

    const editingId = this.editingExperienceId();

    try {
      if (editingId) {
        const response = await firstValueFrom(this.profileService.updateExperience(editingId, payload));
        this.experienceSummary.set(response.experienceSummary ?? null);
        this.experience.update((items) =>
          this.sortExperienceEntries(
            items.map((item) => (item.id === editingId ? response.experience : item))
          )
        );
      } else {
        const response = await firstValueFrom(this.profileService.createExperience(payload));
        this.experienceSummary.set(response.experienceSummary ?? null);
        this.experience.update((items) =>
          this.sortExperienceEntries([
            response.experience,
            ...items.filter((item) => item.id !== response.experience.id)
          ])
        );
      }

      this.experienceEditorOpen.set(false);
      this.editingExperienceId.set(null);
      this.resetExperienceForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo guardar la información de experiencia.';
      this.experienceSubmitError.set(message);
    } finally {
      this.experienceSaving.set(false);
    }
  }

  protected async deleteExperience(entry: ExperienceEntry): Promise<void> {
    if (!entry || this.experienceDeletingId() === entry.id) {
      return;
    }

    const confirmed = window.confirm(`¿Deseas eliminar "${entry.title}" de tu experiencia laboral?`);

    if (!confirmed) {
      return;
    }

    this.experienceDeletingId.set(entry.id);
    this.experienceSubmitError.set(null);

    try {
      const summary = await firstValueFrom(this.profileService.deleteExperience(entry.id));
      this.experienceSummary.set(summary ?? null);
      this.experience.update((items) => items.filter((item) => item.id !== entry.id));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo eliminar el registro de experiencia.';
      this.experienceSubmitError.set(message);
    } finally {
      this.experienceDeletingId.set(null);
    }
  }

  protected openSkillCreator(): void {
    this.editingSkillId.set(null);
    this.skillsSubmitError.set(null);
    this.resetSkillForm();
    this.skillForm.enable();
    this.skillForm.controls.skillId.enable();
    if (!this.skillCatalogLoading() && this.skillCatalog().length === 0) {
      void this.loadSkillCatalog();
    }
    this.skillsEditorOpen.set(true);
    this.skillForm.markAsPristine();
    this.skillForm.markAsUntouched();
  }

  protected editSkill(entry: SkillEntry): void {
    this.skillsSubmitError.set(null);
    this.skillsEditorOpen.set(true);
    this.editingSkillId.set(entry.skillId);
    this.ensureSkillCatalogEntry(entry);
    this.skillForm.setValue({
      skillId: entry.skillId,
      level: entry.level?.toString() ?? '',
      yearsExperience: entry.yearsExperience?.toString() ?? '',
      endorsementCount: entry.endorsementCount?.toString() ?? ''
    });
    this.skillForm.controls.skillId.disable();
    this.skillForm.markAsPristine();
    this.skillForm.markAsUntouched();
  }

  protected cancelSkillEdit(): void {
    if (this.skillsSaving()) {
      return;
    }

    this.skillsEditorOpen.set(false);
    this.skillsSubmitError.set(null);
    this.editingSkillId.set(null);
    this.resetSkillForm();
  }

  protected async saveSkill(): Promise<void> {
    if (this.skillsSaving()) {
      return;
    }

    this.skillsSubmitError.set(null);

    const skillIdControl = this.skillForm.controls.skillId;

    if (!this.editingSkillId() && skillIdControl.invalid) {
      skillIdControl.markAsTouched();
      skillIdControl.markAsDirty();
      return;
    }

    this.skillsSaving.set(true);

    const raw = this.skillForm.getRawValue();
    const selectedCatalog = this.skillCatalog().find((item) => item.skillId === raw.skillId);
    const existingSkill = this.skills().find((item) => item.skillId === raw.skillId);
    const payload: SkillPayload = {
      skillId: raw.skillId ?? null,
      skillName: selectedCatalog?.name ?? existingSkill?.name ?? '',
      level: this.parseSkillNumber(raw.level),
      yearsExperience: this.parseSkillNumber(raw.yearsExperience),
      endorsementCount: this.parseSkillInteger(raw.endorsementCount)
    };

    try {
      const editingId = this.editingSkillId();
      const response = editingId
        ? await firstValueFrom(this.profileService.updateSkill(editingId, payload))
        : await firstValueFrom(this.profileService.createSkill(payload));

      this.skillsSummary.set(response.skillsSummary ?? null);
      this.skills.update((items) => {
        const updated = editingId
          ? items.map((item) => (item.skillId === editingId ? response.skill : item))
          : [response.skill, ...items.filter((item) => item.skillId !== response.skill.skillId)];
        return this.sortSkillEntries(updated);
      });
      this.ensureSkillCatalogEntry(response.skill);

      this.skillsEditorOpen.set(false);
      this.editingSkillId.set(null);
      this.resetSkillForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo guardar la información de la habilidad.';
      this.skillsSubmitError.set(message);
    } finally {
      this.skillsSaving.set(false);
    }
  }

  protected async deleteSkill(entry: SkillEntry): Promise<void> {
    if (!entry || this.skillsDeletingId() === entry.skillId) {
      return;
    }

    const confirmed = window.confirm(`¿Deseas eliminar la habilidad "${entry.name}" de tu perfil?`);

    if (!confirmed) {
      return;
    }

    this.skillsDeletingId.set(entry.skillId);
    this.skillsSubmitError.set(null);

    try {
      const summary = await firstValueFrom(this.profileService.deleteSkill(entry.skillId));
      this.skillsSummary.set(summary ?? null);
      this.skills.update((items) => items.filter((item) => item.skillId !== entry.skillId));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo eliminar la habilidad.';
      this.skillsSubmitError.set(message);
    } finally {
      this.skillsDeletingId.set(null);
    }
  }

  private async loadCities(): Promise<void> {
    this.citiesLoading.set(true);
    this.citiesError.set(null);

    try {
      const cities = await firstValueFrom(this.PFService.getCities());
      this.cityOptions.set(cities);
      this.normalizeCity(this.cityControl.value);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo cargar el listado de ciudades.';
      this.citiesError.set(message);
      this.cityOptions.set([]);
    } finally {
      this.citiesLoading.set(false);
    }
  }

  private async loadInstitutions(): Promise<void> {
    this.institutionsLoading.set(true);
    this.institutionsError.set(null);

    try {
      const institutions = await firstValueFrom(this.PFService.getInstitutions());
      this.institutionOptions.set(institutions);
      this.normalizeInstitution(this.educationForm.controls.institution.value);
      this.education().forEach((entry) => this.ensureInstitutionInOptions(entry.institution));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo cargar el listado de instituciones.';
      this.institutionsError.set(message);
      this.institutionOptions.set([]);
    } finally {
      this.institutionsLoading.set(false);
    }
  }

  private async loadCareers(): Promise<void> {
    this.careersLoading.set(true);
    this.careersError.set(null);

    try {
      const map = await firstValueFrom(this.PFService.getCareerMap());
      const sortedCategories = Object.keys(map).sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
      );
      const orderedMap: Record<string, string[]> = {};

      for (const category of sortedCategories) {
        orderedMap[category] = [...(map[category] ?? [])];
      }

      this.careerOptionsByCategory.set(orderedMap);
      this.careerCategories.set(sortedCategories);
      this.normalizeCareer(this.careerControl.value);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo cargar el listado de carreras.';
      this.careersError.set(message);
      this.careerOptionsByCategory.set({});
      this.careerCategories.set([]);
    } finally {
      this.careersLoading.set(false);
    }
  }

  private async loadProfile(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.submitError.set(null);
    this.successMessage.set(null);
    this.githubErrorMessage.set(null);
    this.githubDataError.set(null);
    this.profileForm.disable({ emitEvent: false });
    this.resetBackendValidation();
    this.avatarHasError.set(false);

    try {
      const isAuthenticated = await firstValueFrom(this.authService.ensureAuthenticated());

      if (!isAuthenticated) {
        throw new Error('La sesión ha expirado. Vuelve a iniciar sesión.');
      }

      const profile = await firstValueFrom(this.profileService.getProfile());
      this.applyProfile(profile);
      this.consumeGithubLinkFeedback();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo consultar el perfil.';
      this.loadError.set(message);
      this.profile.set(null);
      this.resetBackendValidation();
      this.profileForm.reset({
        displayName: '',
        biography: '',
        country: DEFAULT_COUNTRY,
        city: '',
        career: '',
        avatarUrl: '',
        slug: ''
      });
      this.updateSlugAvailabilityForCurrentValue();
      this.educationSummary.set(null);
      this.experienceSummary.set(null);
      this.skillsSummary.set(null);
      this.githubRepositories.set([]);
      this.githubLanguages.set([]);
      this.githubDataError.set(null);
      if (!this.editorOpen()) {
        this.profileForm.disable({ emitEvent: false });
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSkillCatalog(): Promise<void> {
    this.skillCatalogLoading.set(true);
    this.skillCatalogError.set(null);

    try {
      const response = await firstValueFrom(this.profileService.getSkillCatalog());
      const unique = new Map<number, SkillCatalogItem>();

      for (const item of response) {
        if (!item || !item.skillId || !item.name) {
          continue;
        }

        unique.set(item.skillId, {
          skillId: item.skillId,
          name: item.name,
          category: item.category ?? null
        });
      }

      for (const existing of this.skillCatalog()) {
        if (!existing || !existing.skillId || !existing.name) {
          continue;
        }

        if (!unique.has(existing.skillId)) {
          unique.set(existing.skillId, existing);
        }
      }

      this.skillCatalog.set(Array.from(unique.values()));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo obtener el catálogo de habilidades.';
      this.skillCatalogError.set(message);
    } finally {
      this.skillCatalogLoading.set(false);
    }
  }

  private async loadEducation(): Promise<void> {
    this.educationLoading.set(true);
    this.educationError.set(null);

    try {
      const result = await firstValueFrom(this.profileService.getEducation());
      const sorted = this.sortEducationEntries(result.education);
      this.education.set(sorted);
      sorted.forEach((entry) => this.ensureInstitutionInOptions(entry.institution));
      this.educationSummary.set(result.educationSummary ?? null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo obtener la información educativa.';
      this.educationError.set(message);
      this.education.set([]);
      this.educationSummary.set(null);
    } finally {
      this.educationLoading.set(false);
    }
  }

  private async loadExperience(): Promise<void> {
    this.experienceLoading.set(true);
    this.experienceError.set(null);

    try {
      const result = await firstValueFrom(this.profileService.getExperience());
      this.experience.set(this.sortExperienceEntries(result.experience));
      this.experienceSummary.set(result.experienceSummary ?? null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo obtener la información de experiencia laboral.';
      this.experienceError.set(message);
      this.experience.set([]);
      this.experienceSummary.set(null);
    } finally {
      this.experienceLoading.set(false);
    }
  }

  private async loadSkills(): Promise<void> {
    this.skillsLoading.set(true);
    this.skillsError.set(null);

    try {
      const result = await firstValueFrom(this.profileService.getSkills());
      const sorted = this.sortSkillEntries(result.skills);
      this.skills.set(sorted);
      sorted.forEach((entry) => this.ensureSkillCatalogEntry(entry));
      this.skillsSummary.set(result.skillsSummary ?? null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo obtener la información de habilidades.';
      this.skillsError.set(message);
      this.skills.set([]);
      this.skillsSummary.set(null);
    } finally {
      this.skillsLoading.set(false);
    }
  }

  private applyProfile(status: ProfileData): void {
    this.profile.set(status);
    this.applyBackendValidation(status);
    this.avatarHasError.set(false);
    this.educationSummary.set(status.educationSummary ?? null);
    this.experienceSummary.set(status.experienceSummary ?? null);
    this.skillsSummary.set(status.skillsSummary ?? null);
    this.githubRepositories.set(status.githubRepositories ?? []);
    this.githubLanguages.set(status.githubLanguages ?? []);
    this.profileForm.reset({
      displayName: status.displayName ?? '',
      biography: status.biography ?? '',
      country: status.country?.trim() || DEFAULT_COUNTRY,
      city: this.normalizeCity(status.city),
      career: this.normalizeCareer(status.career),
      avatarUrl: status.avatarUrl ?? '',
      slug: status.slug ?? ''
    });
    this.profileForm.markAsPristine();
    this.profileForm.markAsUntouched();
    this.updateSlugAvailabilityForCurrentValue();
    if (this.editorOpen()) {
      this.profileForm.enable({ emitEvent: false });
    } else {
      this.profileForm.disable({ emitEvent: false });
    }
  }

  private setGithubAccount(account: GithubAccountStatus): void {
    const current = this.profile();

    if (!current) {
      return;
    }

    const normalized: GithubAccountStatus = {
      linked: Boolean(account?.linked),
      username: account?.username ?? null,
      profileUrl:
        account?.profileUrl ?? (account?.username ? `https://github.com/${account.username}` : null),
      providerId: account?.providerId ?? null,
      lastSyncedAt: account?.lastSyncedAt ?? null
    };

    this.profile.set({ ...current, githubAccount: normalized });
  }

  private handleGithubAccountChange(account: GithubAccountStatus): void {
    if (!account?.linked) {
      this.githubDataLoading.set(false);
      this.githubDataError.set(null);
      this.githubRepositories.set([]);
      this.githubLanguages.set([]);
      this.fetchedGithubForUsername = null;
      return;
    }

    const username = account.username?.trim();

    if (!username) {
      this.githubDataLoading.set(false);
      this.githubRepositories.set([]);
      this.githubLanguages.set([]);
      this.githubDataError.set('No se pudo determinar el usuario de GitHub vinculado.');
      this.fetchedGithubForUsername = null;
      return;
    }

    const preloadedRepos = this.profile()?.githubRepositories ?? [];
    const preloadedLanguages = this.profile()?.githubLanguages ?? [];

    if (preloadedRepos.length > 0) {
      this.githubRepositories.set(preloadedRepos);
    }

    if (preloadedLanguages.length > 0) {
      this.githubLanguages.set(preloadedLanguages);
    }

    if (this.fetchedGithubForUsername === username && this.githubRepositories().length > 0) {
      return;
    }

    this.fetchedGithubForUsername = username;
    void this.loadGithubRepositories();
  }

  private async loadGithubRepositories(): Promise<void> {
    this.githubDataLoading.set(true);
    this.githubDataError.set(null);

    try {
      const result = await firstValueFrom(this.profileService.getGithubRepositories());
      this.githubRepositories.set(result.repositories ?? []);
      this.githubLanguages.set(result.languages ?? []);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo obtener la información de GitHub vinculada.';
      this.githubDataError.set(message);
      this.githubRepositories.set([]);
      this.githubLanguages.set([]);
      this.fetchedGithubForUsername = null;
    } finally {
      this.githubDataLoading.set(false);
    }
  }

  private consumeGithubLinkFeedback(): void {
    try {
      if (typeof sessionStorage === 'undefined') {
        return;
      }

      const message = sessionStorage.getItem(GITHUB_LINK_FEEDBACK_KEY);

      if (!message) {
        return;
      }

      sessionStorage.removeItem(GITHUB_LINK_FEEDBACK_KEY);
      this.successMessage.set(message);
    } catch {
      // Ignored
    }
  }

  private resetEducationForm(): void {
    this.educationForm.reset({
      institution: '',
      institutionOther: '',
      degree: '',
      fieldOfStudy: '',
      startDate: '',
      endDate: '',
      description: ''
    });
    this.educationForm.markAsPristine();
    this.educationForm.markAsUntouched();
    this.handleEducationInstitutionChange(this.educationForm.controls.institution.value);
  }

  private handleEducationInstitutionChange(value: unknown): void {
    const selected = typeof value === 'string' ? value : '';
    const otherControl = this.educationForm.controls.institutionOther;

    if (selected === OTHER_INSTITUTION_OPTION) {
      otherControl.setValidators([Validators.required]);
    } else {
      otherControl.setValidators([]);

      if (otherControl.value) {
        otherControl.setValue('', { emitEvent: false });
      }
    }

    otherControl.updateValueAndValidity({ emitEvent: false });
  }

  private resetExperienceForm(): void {
    this.experienceForm.reset({
      title: '',
      company: '',
      startDate: '',
      endDate: '',
      location: '',
      description: ''
    });
    this.experienceForm.markAsPristine();
    this.experienceForm.markAsUntouched();
  }

  private resetSkillForm(): void {
    this.skillForm.reset({
      skillId: null,
      level: '',
      yearsExperience: '',
      endorsementCount: ''
    });
    this.skillForm.controls.skillId.enable();
    this.skillForm.markAsPristine();
    this.skillForm.markAsUntouched();
  }

  private resetBackendValidation(): void {
    this.fieldState.set(createEmptyFieldState());
  }

  private ensureSkillCatalogEntry(
    entry: (Pick<SkillEntry, 'skillId' | 'name' | 'category'> | SkillCatalogItem | null | undefined)
  ): void {
    if (!entry) {
      return;
    }

    const skillId = entry.skillId;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';

    if (!skillId || !name) {
      return;
    }

    const category =
      typeof entry.category === 'string' && entry.category.trim().length > 0
        ? entry.category.trim()
        : null;

    this.skillCatalog.update((items) => {
      if (items.some((item) => item.skillId === skillId)) {
        return items;
      }

      return [...items, { skillId, name, category }];
    });
  }

  private applyBackendValidation(profile: ProfileData): void {
    const next = createEmptyFieldState();

    for (const field of PROFILE_FIELDS) {
      const okKey = `ok_${field}` as const;
      const errorKey = `error_${field}` as const;
      next[field] = {
        ok: profile[okKey] ?? true,
        error: profile[errorKey] ?? null
      };
    }

    this.fieldState.set(next);
  }

  private normalizeInstitution(value: string | null | undefined): string {
    if (typeof value !== 'string' || value === OTHER_INSTITUTION_OPTION) {
      return '';
    }

    const normalized = value.trim();
    if (!normalized) {
      return '';
    }

    this.ensureInstitutionInOptions(normalized);
    return normalized;
  }

  private normalizeCity(value: string | null | undefined): string {
    if (typeof value !== 'string') {
      return '';
    }

    const normalized = value.trim();
    this.ensureCityInOptions(normalized);
    return normalized;
  }

  private normalizeCareer(value: string | null | undefined): string {
    if (typeof value !== 'string') {
      return '';
    }

    const normalized = value.trim();
    this.ensureCareerInOptions(normalized);
    return normalized;
  }

  private ensureInstitutionInOptions(institution: string | null | undefined): void {
    if (typeof institution !== 'string') {
      return;
    }

    const normalized = institution.trim();

    if (!normalized) {
      return;
    }

    const options = this.institutionOptions();
    const exists = options.some(
      (option) => option.localeCompare(normalized, 'es', { sensitivity: 'accent' }) === 0
    );

    if (exists) {
      return;
    }

    const updated = [...options, normalized].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
    this.institutionOptions.set(updated);
  }

  private ensureCityInOptions(city: string): void {
    if (!city) {
      return;
    }

    const options = this.cityOptions();
    const exists = options.some(
      (option) => option.localeCompare(city, 'es', { sensitivity: 'accent' }) === 0
    );

    if (exists) {
      return;
    }

    const updated = [...options, city].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
    this.cityOptions.set(updated);
  }

  private ensureCareerInOptions(career: string): void {
    if (!career) {
      return;
    }

    const normalized = career.trim();

    if (!normalized) {
      return;
    }

    const map = this.careerOptionsByCategory();

    const exists = Object.values(map).some((options) =>
      options.some(
        (option) => option.localeCompare(normalized, 'es', { sensitivity: 'accent' }) === 0
      )
    );

    if (exists) {
      return;
    }

    const updatedMap: Record<string, string[]> = { ...map };
    const fallbackOptions = updatedMap[FALLBACK_CAREER_CATEGORY]
      ? [...updatedMap[FALLBACK_CAREER_CATEGORY]]
      : [];

    fallbackOptions.push(normalized);
    fallbackOptions.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    updatedMap[FALLBACK_CAREER_CATEGORY] = fallbackOptions;

    const updatedCategories = new Set(this.careerCategories());
    updatedCategories.add(FALLBACK_CAREER_CATEGORY);

    const sortedCategories = Array.from(updatedCategories).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );

    this.careerOptionsByCategory.set(updatedMap);
    this.careerCategories.set(sortedCategories);
  }

  private resolvePublicProfileBaseUrl(): string {
    const docLocation = this.document?.location ?? (typeof window !== 'undefined' ? window.location : null);
    const origin = docLocation?.origin ?? '';
    const normalizedOrigin = origin ? origin.replace(/\/$/, '') : '';

    if (!normalizedOrigin) {
      return '/user/';
    }

    return `${normalizedOrigin}/user/`;
  }

  private updateSlugAvailabilityForCurrentValue(): void {
    const controlValue = this.slugControl.value;
    const normalizedValue = typeof controlValue === 'string' ? controlValue.trim().toLowerCase() : '';
    const currentSlug = this.profile()?.slug?.trim().toLowerCase() ?? '';

    if (!normalizedValue) {
      this.slugAvailabilityStatus.set('idle');
      this.slugAvailabilityMessage.set(null);
      return;
    }

    if (this.slugControl.invalid) {
      this.slugAvailabilityStatus.set('invalid');
      this.slugAvailabilityMessage.set(null);
      return;
    }

    if (normalizedValue === currentSlug) {
      this.slugAvailabilityStatus.set('available');
      this.slugAvailabilityMessage.set('Esta es tu URL actual.');
      return;
    }

    if (this.slugAvailabilityStatus() === 'unavailable') {
      return;
    }

    this.slugAvailabilityStatus.set('idle');
    this.slugAvailabilityMessage.set(null);
  }

  private hasBackendErrors(profile: ProfileData): boolean {
    return PROFILE_FIELDS.some((field) => {
      const okKey = `ok_${field}` as const;
      return profile[okKey] === false;
    });
  }

  private sortEducationEntries(entries: EducationEntry[]): EducationEntry[] {
    return [...entries].sort((a, b) => {
      const aEnd = this.parseEducationDate(a.endDate);
      const bEnd = this.parseEducationDate(b.endDate);

      if (aEnd !== bEnd) {
        return bEnd - aEnd;
      }

      const aStart = this.parseEducationDate(a.startDate);
      const bStart = this.parseEducationDate(b.startDate);

      return bStart - aStart;
    });
  }

  private sortExperienceEntries(entries: ExperienceEntry[]): ExperienceEntry[] {
    return [...entries].sort((a, b) => {
      const aEnd = this.parseExperienceDate(a.endDate);
      const bEnd = this.parseExperienceDate(b.endDate);

      if (aEnd !== bEnd) {
        return bEnd - aEnd;
      }

      const aStart = this.parseExperienceDate(a.startDate);
      const bStart = this.parseExperienceDate(b.startDate);

      return bStart - aStart;
    });
  }

  private sortSkillEntries(entries: SkillEntry[]): SkillEntry[] {
    return [...entries].sort((a, b) => {
      const levelA = this.parseSkillNumber(a.level);
      const levelB = this.parseSkillNumber(b.level);

      if (levelA !== levelB) {
        return (levelB ?? Number.NEGATIVE_INFINITY) - (levelA ?? Number.NEGATIVE_INFINITY);
      }

      const yearsA = this.parseSkillNumber(a.yearsExperience);
      const yearsB = this.parseSkillNumber(b.yearsExperience);

      if (yearsA !== yearsB) {
        return (yearsB ?? Number.NEGATIVE_INFINITY) - (yearsA ?? Number.NEGATIVE_INFINITY);
      }

      const endorsementsA = this.parseSkillInteger(a.endorsementCount) ?? 0;
      const endorsementsB = this.parseSkillInteger(b.endorsementCount) ?? 0;

      if (endorsementsA !== endorsementsB) {
        return endorsementsB - endorsementsA;
      }

      return (a.name ?? '').localeCompare(b.name ?? '', 'es', { sensitivity: 'base' });
    });
  }

  private parseEducationDate(value: string | null | undefined): number {
    if (!value) {
      return Number.POSITIVE_INFINITY;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return Number.NEGATIVE_INFINITY;
    }

    return parsed.getTime();
  }

  private parseExperienceDate(value: string | null | undefined): number {
    return this.parseEducationDate(value);
  }

  private parseSkillNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseSkillInteger(value: unknown): number | null {
    const parsed = this.parseSkillNumber(value);

    if (parsed === null) {
      return null;
    }

    return Math.max(Math.round(parsed), 0);
  }
  
  currentYear = new Date().getFullYear();
years: number[] = [];

constructor() {
  for (let i = 0; i <= 10; i++) {
    this.years.push(this.currentYear - i);
  }
}

}

