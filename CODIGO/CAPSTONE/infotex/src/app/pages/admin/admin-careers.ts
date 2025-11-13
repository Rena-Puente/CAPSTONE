import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  CareerCatalogCategory,
  CareerCatalogItem
} from '../../services/career-catalog.models';
import { CareersAdminService } from '../../services/careers-admin.service';

type CareerFormControl = 'category' | 'career';

@Component({
  selector: 'app-admin-careers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-careers.html',
  styleUrl: './admin-careers.css'
})
export class AdminCareers implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly careersService = inject(CareersAdminService);

  protected readonly catalog = signal<CareerCatalogCategory[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly submitSuccess = signal<string | null>(null);
  protected readonly deletingKey = signal<string | null>(null);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    category: ['', [Validators.required, Validators.maxLength(100)]],
    career: ['', [Validators.required, Validators.maxLength(150)]]
  });

  async ngOnInit(): Promise<void> {
    await this.loadCatalog();
  }

  protected async loadCatalog(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const catalog = await firstValueFrom(this.careersService.getCatalog());
      this.catalog.set(catalog);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo cargar el catálogo de carreras.';
      this.error.set(message);
      this.catalog.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  protected async refreshCatalog(): Promise<void> {
    await this.loadCatalog();
  }

  protected shouldShowError(control: CareerFormControl): boolean {
    const field = this.form.controls[control];
    return field.invalid && (field.dirty || field.touched || this.isSubmitting());
  }

  protected getControlError(control: CareerFormControl): string | null {
    const field = this.form.controls[control];

    if (!this.shouldShowError(control)) {
      return null;
    }

    if (field.hasError('required')) {
      return control === 'category'
        ? 'La categoría es obligatoria.'
        : 'El nombre de la carrera es obligatorio.';
    }

    if (field.hasError('maxlength')) {
      return control === 'category'
        ? 'La categoría puede tener como máximo 100 caracteres.'
        : 'El nombre de la carrera puede tener como máximo 150 caracteres.';
    }

    return null;
  }

  protected async createCareer(): Promise<void> {
    this.submitError.set(null);
    this.submitSuccess.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    this.isSubmitting.set(true);

    const raw = this.form.getRawValue();
    const category = raw.category.trim();
    const career = raw.career.trim();

    try {
      const created = await firstValueFrom(this.careersService.createCareer(category, career));

      this.catalog.update((entries) => {
        const updated = [...entries];
        const index = updated.findIndex((entry) => entry.category === created.category);

        if (index >= 0) {
          const items = [...updated[index].items, { id: created.id, name: created.name }];
          items.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
          updated[index] = { category: created.category, items };
        } else {
          updated.push({ category: created.category, items: [{ id: created.id, name: created.name }] });
          updated.sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));
        }

        return updated;
      });

      this.form.reset({ category: '', career: '' });
      this.form.markAsPristine();
      this.form.markAsUntouched();
      this.submitSuccess.set('La carrera se creó correctamente.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la carrera.';
      this.submitError.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private buildCareerKey(category: CareerCatalogCategory, item: CareerCatalogItem): string {
    if (item?.id) {
      return `id:${item.id}`;
    }

    const normalizedCategory = category?.category?.trim().toLocaleLowerCase('es') ?? '';
    const normalizedName = item?.name?.trim().toLocaleLowerCase('es') ?? '';

    return `name:${normalizedCategory}|${normalizedName}`;
  }

  protected isDeleting(category: CareerCatalogCategory, item: CareerCatalogItem): boolean {
    const key = this.buildCareerKey(category, item);
    const current = this.deletingKey();

    if (!key || !current) {
      return false;
    }

    return current === key;
  }

  protected async deleteCareer(category: CareerCatalogCategory, item: CareerCatalogItem): Promise<void> {
    const deletingKey = this.buildCareerKey(category, item);

    if (!item || (deletingKey && this.deletingKey() === deletingKey)) {
      return;
    }

    const confirmed = window.confirm(`¿Deseas eliminar la carrera "${item.name}" de "${category.category}"?`);

    if (!confirmed) {
      return;
    }

    this.deletingKey.set(deletingKey);
    this.deleteError.set(null);

    try {
      await firstValueFrom(this.careersService.deleteCareer(item.id, category.category, item.name));

      this.catalog.update((entries) => {
        const normalizedCategory = category.category.trim().toLocaleLowerCase('es');
        const normalizedCareer = item.name.trim().toLocaleLowerCase('es');
        const itemId = item.id ?? null;

        return entries
          .map((entry) => {
            if (entry.category.trim().toLocaleLowerCase('es') !== normalizedCategory) {
              return entry;
            }

            const items = entry.items.filter((current) => {
              if (itemId && current.id) {
                return current.id !== itemId;
              }

              return current.name.trim().toLocaleLowerCase('es') !== normalizedCareer;
            });

            return { category: entry.category, items };
          })
          .filter((entry) => entry.items.length > 0);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar la carrera.';
      this.deleteError.set(message);
    } finally {
      this.deletingKey.set(null);
    }
  }
}
