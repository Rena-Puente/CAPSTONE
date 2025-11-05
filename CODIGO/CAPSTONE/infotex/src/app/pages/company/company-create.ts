import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

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
  templateUrl: './company-create.html'
})
export class CompanyCreate {
  private readonly fb = inject(FormBuilder);

  private readonly emptyFormValue: Record<CompanyFormControlName, string> = {
    name: '',
    website: '',
    country: '',
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
    country: ['', [Validators.required, Validators.maxLength(80)]],
    city: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(64)]],
    rut: [
      '',
      [
        Validators.required,
        Validators.maxLength(12),
        Validators.pattern(/^[0-9]{7,8}-[0-9kK]$/)
      ]
    ],
    phone: ['', [Validators.maxLength(20)]],
    description: ['', [Validators.maxLength(500)]]
  });

  protected submit(): void {
    this.submitAttempted.set(true);
    this.submitSuccess.set(false);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    const payload = this.form.getRawValue();

    console.info('[CompanyCreate] Submitting company registration', payload);

    this.form.reset(this.emptyFormValue);
    this.submitAttempted.set(false);
    this.submitSuccess.set(true);
    this.isSubmitting.set(false);
  }

  protected shouldShowError(control: AbstractControl | null): boolean {
    if (!control) {
      return false;
    }

    return control.invalid && (control.dirty || control.touched || this.submitAttempted());
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
          return 'El RUT puede tener como máximo 12 caracteres.';
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
}
