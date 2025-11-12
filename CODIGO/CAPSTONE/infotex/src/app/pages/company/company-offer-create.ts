import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { CompanyService, CompanyOfferPayload } from '../../services/company.service';
import { ProfileFieldsService } from '../../services/profilefields.service';

type OfferControlName =
  | 'title'
  | 'description'
  | 'locationType'
  | 'city'
  | 'country'
  | 'seniority'
  | 'contractType';

@Component({
  selector: 'app-company-offer-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './company-offer-create.html',
  styleUrl: './company-offer-create.css'
})
export class CompanyOfferCreate implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly companyService = inject(CompanyService);
  private readonly profileFieldsService = inject(ProfileFieldsService);

  protected readonly isSubmitting = signal(false);
  protected readonly submitSuccess = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly submitAttempted = signal(false);
  protected readonly seniorityOptions = signal<string[]>([]);
  protected readonly seniorityLoading = signal(false);
  protected readonly seniorityError = signal<string | null>(null);
  protected readonly shouldUseSeniorityFallback = computed(
    () =>
      Boolean(this.seniorityError()) || (!this.seniorityLoading() && this.seniorityOptions().length === 0)
  );

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', [Validators.required, Validators.maxLength(8000)]],
    locationType: ['', [Validators.required, Validators.maxLength(20)]],
    city: ['', [Validators.required, Validators.maxLength(80)]],
    country: ['', [Validators.required, Validators.maxLength(80)]],
    seniority: ['', [Validators.required, Validators.maxLength(30)]],
    contractType: ['', [Validators.required, Validators.maxLength(30)]]
  });

  async ngOnInit(): Promise<void> {
    await this.loadSeniorityOptions();
  }

  protected async submit(): Promise<void> {
    this.submitAttempted.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(false);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    const raw = this.form.getRawValue();
    const payload: CompanyOfferPayload = {
      title: raw.title.trim(),
      description: raw.description.trim(),
      locationType: raw.locationType.trim(),
      city: raw.city.trim(),
      country: raw.country.trim(),
      seniority: raw.seniority.trim(),
      contractType: raw.contractType.trim()
    };

    try {
      const offer = await firstValueFrom(this.companyService.createOffer(payload));
      console.info('[CompanyOfferCreate] Offer created successfully', offer);

      this.form.reset({
        title: '',
        description: '',
        locationType: '',
        city: '',
        country: '',
        seniority: '',
        contractType: ''
      });
      this.submitAttempted.set(false);
      this.submitSuccess.set(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la oferta.';
      console.error('[CompanyOfferCreate] Failed to create offer', { error: message });
      this.submitError.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected shouldShowError(controlName: OfferControlName): boolean {
    const control = this.form.controls[controlName];

    return control.invalid && (control.dirty || control.touched || this.submitAttempted());
  }

  protected getControlError(controlName: OfferControlName): string | null {
    const control = this.form.controls[controlName];

    if (!this.shouldShowError(controlName)) {
      return null;
    }

    if (control.hasError('required')) {
      switch (controlName) {
        case 'title':
          return 'El título de la oferta es obligatorio.';
        case 'description':
          return 'Describe los detalles principales de la posición.';
        case 'locationType':
          return 'Indica la modalidad de trabajo.';
        case 'city':
          return 'Indica la ciudad donde se desempeñará el cargo.';
        case 'country':
          return 'Indica el país de la oferta.';
        case 'seniority':
          return 'Indica el nivel de seniority requerido.';
        case 'contractType':
          return 'Indica el tipo de contrato ofrecido.';
      }
    }

    if (control.hasError('maxlength')) {
      switch (controlName) {
        case 'title':
          return 'El título puede tener como máximo 150 caracteres.';
        case 'description':
          return 'La descripción puede tener como máximo 8000 caracteres.';
        case 'locationType':
          return 'La modalidad puede tener como máximo 20 caracteres.';
        case 'city':
          return 'La ciudad puede tener como máximo 80 caracteres.';
        case 'country':
          return 'El país puede tener como máximo 80 caracteres.';
        case 'seniority':
          return 'La seniority puede tener como máximo 30 caracteres.';
        case 'contractType':
          return 'El tipo de contrato puede tener como máximo 30 caracteres.';
      }
    }

    return null;
  }

  private async loadSeniorityOptions(): Promise<void> {
    this.seniorityLoading.set(true);
    this.seniorityError.set(null);

    try {
      const levels = await firstValueFrom(this.profileFieldsService.getSeniorityLevels());
      this.seniorityOptions.set(levels);
      this.normalizeSeniority(this.form.controls.seniority.value);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar los niveles de seniority.';
      this.seniorityError.set(message);
      this.seniorityOptions.set([]);
      this.form.controls.seniority.reset('', { emitEvent: false });
    } finally {
      this.seniorityLoading.set(false);
    }
  }

  private normalizeSeniority(value: string | null | undefined): void {
    const control = this.form.controls.seniority;
    const trimmed = typeof value === 'string' ? value.trim() : '';
    const options = this.seniorityOptions();

    if (!trimmed) {
      control.setValue('', { emitEvent: false });
      return;
    }

    if (options.includes(trimmed)) {
      control.setValue(trimmed, { emitEvent: false });
      return;
    }

    if (!this.shouldUseSeniorityFallback()) {
      control.setValue('', { emitEvent: false });
    }
  }
}
