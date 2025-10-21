import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import {
  PROFILE_FIELDS,
  ProfileData,
  ProfileField,
  ProfileService,
  UpdateProfilePayload,
  EducationEntry,
  EducationPayload,
  EducationSummary
} from '../../services/profile.service';

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

function createEmptyFieldState(): FieldState {
  return PROFILE_FIELDS.reduce((acc, field) => {
    acc[field] = { ok: true, error: null };
    return acc;
  }, {} as FieldState);
}

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
export class Profile implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

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
  protected readonly education = signal<EducationEntry[]>([]);
  protected readonly educationSummary = signal<EducationSummary | null>(null);
  protected readonly educationLoading = signal(false);
  protected readonly educationError = signal<string | null>(null);
  protected readonly educationEditorOpen = signal(false);
  protected readonly educationSaving = signal(false);
  protected readonly educationSubmitError = signal<string | null>(null);
  protected readonly editingEducationId = signal<number | null>(null);
  protected readonly educationDeletingId = signal<number | null>(null);

  protected readonly defaultAvatars = [
    { label: 'Avatar 1', url: '/avatars/avatar1.svg' },
    { label: 'Avatar 2', url: '/avatars/avatar2.svg' },
    { label: 'Avatar 3', url: '/avatars/avatar3.svg' },
    { label: 'Avatar 4', url: '/avatars/avatar4.svg' },
    { label: 'Avatar 5', url: '/avatars/avatar5.svg' },
    { label: 'Avatar 6', url: '/avatars/avatar6.svg' },
    { label: 'Avatar 7', url: '/avatars/avatar7.svg' },
    { label: 'Avatar 8', url: '/avatars/avatar8.svg' },
    { label: 'Avatar 9', url: '/avatars/avatar9.svg' },
    { label: 'Avatar 10', url: '/avatars/avatar10.svg' },
    { label: 'Avatar 11', url: '/avatars/avatar11.svg' },
    { label: 'Avatar 12', url: '/avatars/avatar12.svg' }
  ];

  protected readonly isComplete = computed(() => this.profile()?.isComplete ?? false);
  protected readonly missingFields = computed(() => this.profile()?.missingFields ?? []);

  protected readonly profileForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required]],
    headline: ['', [Validators.required]],
    biography: ['', [Validators.required, minTrimmedLengthValidator(80)]],
    country: ['', [Validators.required]],
    city: ['', [Validators.required]],
    avatarUrl: ['', [Validators.required, avatarUrlValidator()]]

  });

  protected readonly educationForm = this.fb.nonNullable.group({
    institution: ['', [Validators.required]],
    degree: [''],
    fieldOfStudy: [''],
    startDate: [''],
    endDate: [''],
    description: ['']
  });

  async ngOnInit(): Promise<void> {
    await this.loadProfile();
    await this.loadEducation();
  }

  protected async retry(): Promise<void> {
    await this.loadProfile();
  }

  protected openEditor(): void {
    if (this.loading()) {
      return;
    }

    this.editorOpen.set(true);
    this.profileForm.enable({ emitEvent: false });
  }

  protected closeEditor(): void {
    if (!this.editorOpen()) {
      return;
    }

    this.editorOpen.set(false);

    const currentProfile = this.profile();

    if (currentProfile) {
      this.applyProfile(currentProfile);
    } else {
      this.profileForm.reset({
        displayName: '',
        headline: '',
        biography: '',
        country: '',
        city: '',
        avatarUrl: ''
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

  protected get headlineControl() {
    return this.profileForm.controls.headline;
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

  protected get avatarUrlControl() {
    return this.profileForm.controls.avatarUrl;
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

  protected async save(): Promise<void> {
    this.submitError.set(null);
    this.successMessage.set(null);

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.profileForm.disable({ emitEvent: false });

    const rawValue = this.profileForm.getRawValue();
    const payload: UpdateProfilePayload = {
      displayName: rawValue.displayName.trim(),
      headline: rawValue.headline.trim(),
      biography: rawValue.biography.trim(),
      country: rawValue.country.trim(),
      city: rawValue.city.trim(),
      avatarUrl: rawValue.avatarUrl.trim()
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
      institution: entry.institution ?? '',
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
    const payload: EducationPayload = {
      institution: raw.institution.trim(),
      degree: raw.degree.trim() || null,
      fieldOfStudy: raw.fieldOfStudy.trim() || null,
      startDate: raw.startDate.trim() || null,
      endDate: raw.endDate.trim() || null,
      description: raw.description.trim() || null
    };

    const editingId = this.editingEducationId();

    try {
      if (editingId) {
        const response = await firstValueFrom(this.profileService.updateEducation(editingId, payload));
        this.educationSummary.set(response.educationSummary ?? null);
        this.education.update((items) =>
          this.sortEducationEntries(
            items.map((item) => (item.id === editingId ? response.education : item))
          )
        );
      } else {
        const response = await firstValueFrom(this.profileService.createEducation(payload));
        this.educationSummary.set(response.educationSummary ?? null);
        this.education.update((items) =>
          this.sortEducationEntries([
            response.education,
            ...items.filter((item) => item.id !== response.education.id)
          ])
        );
      }

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

  private async loadProfile(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.submitError.set(null);
    this.successMessage.set(null);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo consultar el perfil.';
      this.loadError.set(message);
      this.profile.set(null);
      this.resetBackendValidation();
      this.profileForm.reset({
        displayName: '',
        headline: '',
        biography: '',
        country: '',
        city: '',
        avatarUrl: ''
      });
      if (!this.editorOpen()) {
        this.profileForm.disable({ emitEvent: false });
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async loadEducation(): Promise<void> {
    this.educationLoading.set(true);
    this.educationError.set(null);

    try {
      const result = await firstValueFrom(this.profileService.getEducation());
      this.education.set(this.sortEducationEntries(result.education));
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

  private applyProfile(status: ProfileData): void {
    this.profile.set(status);
    this.applyBackendValidation(status);
    this.avatarHasError.set(false);
    if (status.educationSummary) {
      this.educationSummary.set(status.educationSummary);
    }
    this.profileForm.reset({
      displayName: status.displayName ?? '',
      headline: status.headline ?? '',
      biography: status.biography ?? '',
      country: status.country ?? '',
      city: status.city ?? '',
      avatarUrl: status.avatarUrl ?? ''
    });
    this.profileForm.markAsPristine();
    this.profileForm.markAsUntouched();
    if (this.editorOpen()) {
      this.profileForm.enable({ emitEvent: false });
    } else {
      this.profileForm.disable({ emitEvent: false });
    }
  }

  private resetEducationForm(): void {
    this.educationForm.reset({
      institution: '',
      degree: '',
      fieldOfStudy: '',
      startDate: '',
      endDate: '',
      description: ''
    });
    this.educationForm.markAsPristine();
    this.educationForm.markAsUntouched();
  }

  private resetBackendValidation(): void {
    this.fieldState.set(createEmptyFieldState());
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
}
