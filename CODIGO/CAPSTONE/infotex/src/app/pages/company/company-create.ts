import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CompanyService, CompanyRegistrationPayload } from '../../services/company.service';
import { ProfileFieldsService } from '../../services/profilefields.service';

type CompanyFormControlName =
  | 'name'
  | 'website'
  | 'country'
  | 'city'
  | 'email'
  | 'password'
  | 'rut'
  | 'phone'
  | 'description';

@Component({
  selector: 'app-company-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './company-create.html',
  styleUrl: './company-create.css'
})
export class CompanyCreate implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly companyService = inject(CompanyService);
  private readonly profileFieldsService = inject(ProfileFieldsService);

  protected readonly countryOptions = ['Chile'];
  private readonly defaultCountry = this.countryOptions[0] ?? '';

  protected readonly cityOptions = signal<string[]>([]);
  protected readonly citiesLoading = signal(false);
  protected readonly citiesError = signal<string | null>(null);

  private readonly emptyFormValue: Record<CompanyFormControlName, string> = {
    name: '',
    website: '',
    country: this.defaultCountry,
    city: '',
    email: '',
    password: '',
    rut: '',
    phone: '',
    description: ''
  };

  protected readonly isSubmitting = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly submitSuccess = signal(false);
  protected readonly submitError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    website: [
      '',
      [
        Validators.required,
        Validators.maxLength(200),
        Validators.pattern(/^https?:\/\/[\w.-]+(?:\/[\w\-./?%&=]*)?$/i)
      ]
    ],
    country: [this.defaultCountry, [Validators.required, Validators.maxLength(80)]],
    city: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(64)]],
    rut: [
      '',
      [
        Validators.required,
        Validators.maxLength(10),
        Validators.pattern(/^[0-9]{7,8}-[0-9kK]$/)
      ]
    ],
    phone: ['', [Validators.maxLength(20)]],
    description: ['', [Validators.maxLength(500)]]
  });

  async ngOnInit(): Promise<void> {
    this.form.controls.country.setValue(this.defaultCountry, { emitEvent: false });
    await this.loadCityOptions();
  }

  protected async submit(): Promise<void> {
    this.submitAttempted.set(true);
    this.submitSuccess.set(false);
    this.submitError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    const raw = this.form.getRawValue();
    const payload: CompanyRegistrationPayload = {
      name: raw.name.trim(),
      website: raw.website.trim(),
      country: raw.country.trim(),
      city: raw.city.trim(),
      email: raw.email.trim(),
      password: raw.password,
      rut: raw.rut.trim()
    };

    const trimmedPhone = raw.phone.trim();
    const trimmedDescription = raw.description.trim();

    if (trimmedPhone) {
      payload.phone = trimmedPhone;
    }

    if (trimmedDescription) {
      payload.description = trimmedDescription;
    }

    try {
      const company = await firstValueFrom(this.companyService.registerCompany(payload));

      console.info('[CompanyCreate] Company registered successfully', company);

      this.form.reset(this.emptyFormValue);
      this.submitAttempted.set(false);
      this.submitSuccess.set(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo registrar la empresa.';
      console.error('[CompanyCreate] Company registration failed', { error: message });
      this.submitError.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected shouldShowError(control: AbstractControl | null): boolean {
    if (!control) {
      return false;
    }

    return control.invalid && (control.dirty || control.touched || this.submitAttempted());
  }

  protected trackByValue(_: number, item: string): string {
    return item;
  }

  protected getControlErrorMessage(controlName: CompanyFormControlName): string | null {
    const control = this.form.controls[controlName];

    if (!this.shouldShowError(control)) {
      return null;
    }

    if (control.hasError('required')) {
      switch (controlName) {
        case 'name':
          return 'El nombre de la empresa es obligatorio.';
        case 'website':
          return 'Ingresa el sitio web de tu empresa.';
        case 'country':
          return 'Indica el país donde opera la empresa.';
        case 'city':
          return 'Indica la ciudad principal de la empresa.';
        case 'email':
          return 'Necesitamos un correo de contacto.';
        case 'password':
          return 'Crea una contraseña para acceder a la plataforma.';
        case 'rut':
          return 'El RUT de la empresa es obligatorio.';
      }
    }

    if (control.hasError('email')) {
      return 'Ingresa un correo electrónico válido.';
    }

    if (control.hasError('minlength')) {
      if (controlName === 'password') {
        return 'La contraseña debe tener al menos 8 caracteres.';
      }
    }

    if (control.hasError('maxlength')) {
      switch (controlName) {
        case 'name':
          return 'El nombre puede tener como máximo 120 caracteres.';
        case 'website':
          return 'El sitio web es demasiado largo. Usa hasta 200 caracteres.';
        case 'country':
          return 'El país puede tener como máximo 80 caracteres.';
        case 'city':
          return 'La ciudad puede tener como máximo 80 caracteres.';
        case 'email':
          return 'El correo puede tener como máximo 160 caracteres.';
        case 'rut':
          return 'El RUT puede tener como máximo 10 caracteres.';
        case 'phone':
          return 'El teléfono puede tener como máximo 20 caracteres.';
        case 'description':
          return 'La descripción puede tener como máximo 500 caracteres.';
      }
    }

    if (control.hasError('pattern')) {
      switch (controlName) {
        case 'website':
          return 'Ingresa una URL válida que comience con http:// o https://';
        case 'rut':
          return 'El formato del RUT debe ser 12345678-9 o 12345678-K.';
      }
    }

    return null;
  }

  private async loadCityOptions(): Promise<void> {
    this.citiesLoading.set(true);
    this.citiesError.set(null);

    try {
      const cities = await firstValueFrom(this.profileFieldsService.getCities());
      this.cityOptions.set(cities);
      this.normalizeCity(this.form.controls.city.value);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudieron cargar las ciudades disponibles.';
      console.error('[CompanyCreate] Failed to load cities', { error: message });
      this.citiesError.set(message);
      this.cityOptions.set([]);
      this.form.controls.city.reset('', { emitEvent: false });
    } finally {
      this.citiesLoading.set(false);
    }
  }

  private normalizeCity(value: string | null | undefined): void {
    const control = this.form.controls.city;
    const trimmed = typeof value === 'string' ? value.trim() : '';
    const options = this.cityOptions();

    if (!trimmed) {
      control.setValue('', { emitEvent: false });
      return;
    }

    if (options.includes(trimmed)) {
      control.setValue(trimmed, { emitEvent: false });
      return;
    }

    control.setValue('', { emitEvent: false });
  }
}
