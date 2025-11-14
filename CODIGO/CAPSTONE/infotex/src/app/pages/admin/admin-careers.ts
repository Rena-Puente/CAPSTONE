import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  CareerCatalogCategory,
  CareerCatalogItem
} from '../../services/career-catalog.models';
import { CareersAdminService } from '../../services/careers-admin.service';
import {
  StudyHousesAdminService,
  StudyHouseItem
} from '../../services/study-houses-admin.service';
import {
  SkillCatalogItem,
  SkillsAdminService
} from '../../services/skills-admin.service';

type CareerFormControl = 'category' | 'career';
type StudyHouseFormControl = 'house';
type SkillFormControl = 'category' | 'skill';

interface SkillCatalogGroup {
  category: string;
  items: SkillCatalogItem[];
}

@Component({
  selector: 'app-admin-careers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-careers.html',
  styleUrl: './admin-careers.css'
})
export class AdminCareers {
  private readonly fb = inject(FormBuilder);
  private readonly careersService = inject(CareersAdminService);
  private readonly studyHousesService = inject(StudyHousesAdminService);
  private readonly skillsService = inject(SkillsAdminService);

  protected readonly catalog = signal<CareerCatalogCategory[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly submitSuccess = signal<string | null>(null);
  protected readonly deletingKey = signal<string | null>(null);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly totalCareers = computed(() =>
    this.catalog().reduce((total, category) => total + category.items.length, 0)
  );
  protected readonly isCatalogExpanded = signal(false);
  private readonly hasLoadedCatalog = signal(false);

  protected readonly houseForm = this.fb.nonNullable.group({
    house: ['', [Validators.required, Validators.maxLength(150)]]
  });
  protected readonly houses = signal<StudyHouseItem[]>([]);
  protected readonly housesLoading = signal(false);
  protected readonly housesError = signal<string | null>(null);
  protected readonly houseIsSubmitting = signal(false);
  protected readonly houseSubmitError = signal<string | null>(null);
  protected readonly houseSubmitSuccess = signal<string | null>(null);
  protected readonly houseDeletingKey = signal<string | null>(null);
  protected readonly houseDeleteError = signal<string | null>(null);
  protected readonly isHouseCatalogExpanded = signal(false);
  private readonly hasLoadedHouses = signal(false);
  protected readonly totalStudyHouses = computed(() => this.houses().length);

  protected readonly skillForm = this.fb.nonNullable.group({
    category: ['', [Validators.required, Validators.maxLength(100)]],
    skill: ['', [Validators.required, Validators.maxLength(150)]]
  });
  protected readonly skills = signal<SkillCatalogItem[]>([]);
  protected readonly skillsLoading = signal(false);
  protected readonly skillsError = signal<string | null>(null);
  protected readonly skillIsSubmitting = signal(false);
  protected readonly skillSubmitError = signal<string | null>(null);
  protected readonly skillSubmitSuccess = signal<string | null>(null);
  protected readonly skillDeletingKey = signal<string | null>(null);
  protected readonly skillDeleteError = signal<string | null>(null);
  protected readonly isSkillCatalogExpanded = signal(false);
  private readonly hasLoadedSkills = signal(false);
  protected readonly totalSkills = computed(() => this.skills().length);
  protected readonly skillsByCategory = computed<SkillCatalogGroup[]>(() => {
    const groups = new Map<string, SkillCatalogItem[]>();

    for (const skill of this.skills()) {
      const normalizedCategory = skill.category.trim() || 'Sin categoría';
      const current = groups.get(normalizedCategory) ?? [];
      current.push(skill);
      groups.set(normalizedCategory, current);
    }

    return Array.from(groups.entries())
      .map(([category, items]) => ({
        category,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
      }))
      .sort((a, b) => a.category.localeCompare(b.category, 'es', { sensitivity: 'base' }));
  });

  protected readonly form = this.fb.nonNullable.group({
    category: ['', [Validators.required, Validators.maxLength(100)]],
    career: ['', [Validators.required, Validators.maxLength(150)]]
  });

  protected async loadCatalog(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const catalog = await firstValueFrom(this.careersService.getCatalog());
      this.catalog.set(catalog);
      this.hasLoadedCatalog.set(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo cargar el catálogo de carreras.';
      this.error.set(message);
      this.catalog.set([]);
      this.hasLoadedCatalog.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  protected async refreshCatalog(): Promise<void> {
    await this.loadCatalog();
  }

  protected async loadStudyHouses(): Promise<void> {
    this.housesLoading.set(true);
    this.housesError.set(null);

    try {
      const houses = await firstValueFrom(this.studyHousesService.getCatalog());
      this.houses.set(houses);
      this.hasLoadedHouses.set(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el catálogo de casas de estudios.';
      this.housesError.set(message);
      this.houses.set([]);
      this.hasLoadedHouses.set(false);
    } finally {
      this.housesLoading.set(false);
    }
  }

  protected async refreshStudyHouses(): Promise<void> {
    await this.loadStudyHouses();
  }

  protected async loadSkills(): Promise<void> {
    this.skillsLoading.set(true);
    this.skillsError.set(null);

    try {
      const skills = await firstValueFrom(this.skillsService.getCatalog());
      this.skills.set(skills);
      this.hasLoadedSkills.set(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el catálogo de habilidades.';
      this.skillsError.set(message);
      this.skills.set([]);
      this.hasLoadedSkills.set(false);
    } finally {
      this.skillsLoading.set(false);
    }
  }

  protected async refreshSkills(): Promise<void> {
    await this.loadSkills();
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

  protected shouldShowSkillError(control: SkillFormControl): boolean {
    const field = this.skillForm.controls[control];
    return field.invalid && (field.dirty || field.touched || this.skillIsSubmitting());
  }

  protected getSkillControlError(control: SkillFormControl): string | null {
    const field = this.skillForm.controls[control];

    if (!this.shouldShowSkillError(control)) {
      return null;
    }

    if (field.hasError('required')) {
      return control === 'category'
        ? 'La categoría es obligatoria.'
        : 'El nombre de la habilidad es obligatorio.';
    }

    if (field.hasError('maxlength')) {
      return control === 'category'
        ? 'La categoría puede tener como máximo 100 caracteres.'
        : 'El nombre de la habilidad puede tener como máximo 150 caracteres.';
    }

    return null;
  }

  protected shouldShowHouseError(control: StudyHouseFormControl): boolean {
    const field = this.houseForm.controls[control];
    return field.invalid && (field.dirty || field.touched || this.houseIsSubmitting());
  }

  protected getHouseControlError(control: StudyHouseFormControl): string | null {
    const field = this.houseForm.controls[control];

    if (!this.shouldShowHouseError(control)) {
      return null;
    }

    if (field.hasError('required')) {
      return 'El nombre de la casa de estudios es obligatorio.';
    }

    if (field.hasError('maxlength')) {
      return 'El nombre de la casa de estudios puede tener como máximo 150 caracteres.';
    }

    return null;
  }

  protected toggleCatalog(): void {
    const expanded = !this.isCatalogExpanded();
    this.isCatalogExpanded.set(expanded);

    if (expanded && !this.hasLoadedCatalog()) {
      void this.loadCatalog();
    }
  }

  protected toggleSkillCatalog(): void {
    const expanded = !this.isSkillCatalogExpanded();
    this.isSkillCatalogExpanded.set(expanded);

    if (expanded && !this.hasLoadedSkills()) {
      void this.loadSkills();
    }
  }

  protected toggleHouseCatalog(): void {
    const expanded = !this.isHouseCatalogExpanded();
    this.isHouseCatalogExpanded.set(expanded);

    if (expanded && !this.hasLoadedHouses()) {
      void this.loadStudyHouses();
    }
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

    const rawId = item?.id ?? null;
    let sanitizedId: number | null = null;

    if (rawId !== null && rawId !== undefined && String(rawId).trim() !== '') {
      const parsedId = Number.parseInt(String(rawId), 10);

      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        this.deleteError.set('El identificador de la carrera no es válido.');
        return;
      }

      sanitizedId = parsedId;
    }

    const normalizedCategory = category?.category?.trim() ?? '';
    const normalizedCareer = item?.name?.trim() ?? '';

    if (sanitizedId === null && (!normalizedCategory || !normalizedCareer)) {
      this.deleteError.set('Debes indicar la categoría y el nombre de la carrera a eliminar.');
      return;
    }

    const confirmed = window.confirm(`¿Deseas eliminar la carrera "${item.name}" de "${category.category}"?`);

    if (!confirmed) {
      return;
    }

    this.deletingKey.set(deletingKey);
    this.deleteError.set(null);

    try {
      await firstValueFrom(this.careersService.deleteCareer(sanitizedId, normalizedCategory, normalizedCareer));
      this.catalog.update((entries) => {
        const normalizedCategory = category.category.trim().toLocaleLowerCase('es');
        const normalizedCareer = item.name.trim().toLocaleLowerCase('es');
        const targetId = sanitizedId;

        return entries
          .map((entry) => {
            if (entry.category.trim().toLocaleLowerCase('es') !== normalizedCategory) {
              return entry;
            }

            const items = entry.items.filter((current) => {
              if (targetId && current.id) {
                return current.id !== targetId;
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

  protected async createSkill(): Promise<void> {
    this.skillSubmitError.set(null);
    this.skillSubmitSuccess.set(null);
    this.skillForm.markAllAsTouched();

    if (this.skillForm.invalid) {
      return;
    }

    this.skillIsSubmitting.set(true);

    const raw = this.skillForm.getRawValue();
    const category = raw.category.trim();
    const skill = raw.skill.trim();

    try {
      const created = await firstValueFrom(this.skillsService.createSkill(category, skill));

      this.skills.update((entries) => {
        const updated = [...entries, created];
        return updated.sort((a, b) => {
          const categoryComparison = a.category.localeCompare(b.category, 'es', {
            sensitivity: 'base'
          });

          if (categoryComparison !== 0) {
            return categoryComparison;
          }

          return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
        });
      });

      this.skillForm.reset({ category: '', skill: '' });
      this.skillForm.markAsPristine();
      this.skillForm.markAsUntouched();
      this.skillSubmitSuccess.set('La habilidad se creó correctamente.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la habilidad.';
      this.skillSubmitError.set(message);
    } finally {
      this.skillIsSubmitting.set(false);
    }
  }

  private buildSkillKey(item: SkillCatalogItem): string {
    if (item?.id) {
      return `id:${item.id}`;
    }

    const normalizedCategory = item.category.trim().toLocaleLowerCase('es');
    const normalizedName = item.name.trim().toLocaleLowerCase('es');

    return `name:${normalizedCategory}|${normalizedName}`;
  }

  protected isSkillDeleting(item: SkillCatalogItem): boolean {
    const key = this.buildSkillKey(item);
    const current = this.skillDeletingKey();

    if (!key || !current) {
      return false;
    }

    return current === key;
  }

  protected async deleteSkill(item: SkillCatalogItem): Promise<void> {
    const deletingKey = this.buildSkillKey(item);

    if (!item || (deletingKey && this.skillDeletingKey() === deletingKey)) {
      return;
    }

    const rawId = item?.id ?? null;
    let sanitizedId: number | null = null;

    if (rawId !== null && rawId !== undefined && String(rawId).trim() !== '') {
      const parsedId = Number.parseInt(String(rawId), 10);

      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        this.skillDeleteError.set('El identificador de la habilidad no es válido.');
        return;
      }

      sanitizedId = parsedId;
    }

    const normalizedName = item.name.trim();

    if (sanitizedId === null && !normalizedName) {
      this.skillDeleteError.set('Debes indicar el nombre de la habilidad a eliminar.');
      return;
    }

    const categoryLabel = item.category.trim();
    const confirmMessage = categoryLabel
      ? `¿Deseas eliminar la habilidad "${item.name}" de "${categoryLabel}"?`
      : `¿Deseas eliminar la habilidad "${item.name}"?`;

    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) {
      return;
    }

    this.skillDeletingKey.set(deletingKey);
    this.skillDeleteError.set(null);

    try {
      await firstValueFrom(this.skillsService.deleteSkill(sanitizedId, normalizedName));
      const normalizedCategory = item.category.trim().toLocaleLowerCase('es');
      const normalizedSkill = normalizedName.trim().toLocaleLowerCase('es');
      const targetId = sanitizedId;

      this.skills.update((entries) =>
        entries.filter((current) => {
          if (targetId && current.id) {
            return current.id !== targetId;
          }

          return !(
            current.category.trim().toLocaleLowerCase('es') === normalizedCategory &&
            current.name.trim().toLocaleLowerCase('es') === normalizedSkill
          );
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar la habilidad.';
      this.skillDeleteError.set(message);
    } finally {
      this.skillDeletingKey.set(null);
    }
  }

  protected async createStudyHouse(): Promise<void> {
    this.houseSubmitError.set(null);
    this.houseSubmitSuccess.set(null);
    this.houseForm.markAllAsTouched();

    if (this.houseForm.invalid) {
      return;
    }

    this.houseIsSubmitting.set(true);

    const raw = this.houseForm.getRawValue();
    const name = raw.house.trim();

    try {
      const created = await firstValueFrom(this.studyHousesService.createStudyHouse(name));

      this.houses.update((entries) => {
        const updated = [...entries, created];
        updated.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
        return updated;
      });

      this.houseForm.reset({ house: '' });
      this.houseForm.markAsPristine();
      this.houseForm.markAsUntouched();
      this.houseSubmitSuccess.set('La casa de estudios se creó correctamente.');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo crear la casa de estudios.';
      this.houseSubmitError.set(message);
    } finally {
      this.houseIsSubmitting.set(false);
    }
  }

  private buildHouseKey(item: StudyHouseItem): string {
    if (item?.id) {
      return `id:${item.id}`;
    }

    const normalizedName = item?.name?.trim().toLocaleLowerCase('es') ?? '';
    return `name:${normalizedName}`;
  }

  protected isHouseDeleting(item: StudyHouseItem): boolean {
    const key = this.buildHouseKey(item);
    const current = this.houseDeletingKey();

    if (!key || !current) {
      return false;
    }

    return current === key;
  }

  protected async deleteStudyHouse(item: StudyHouseItem): Promise<void> {
    const deletingKey = this.buildHouseKey(item);

    if (!item || (deletingKey && this.houseDeletingKey() === deletingKey)) {
      return;
    }

    const rawId = item?.id ?? null;
    let sanitizedId: number | null = null;

    if (rawId !== null && rawId !== undefined && String(rawId).trim() !== '') {
      const parsedId = Number.parseInt(String(rawId), 10);

      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        this.houseDeleteError.set('El identificador de la casa de estudios no es válido.');
        return;
      }

      sanitizedId = parsedId;
    }

    const normalizedName = item?.name?.trim() ?? '';

    if (sanitizedId === null && !normalizedName) {
      this.houseDeleteError.set('Debes indicar el nombre de la casa de estudios a eliminar.');
      return;
    }

    const confirmed = window.confirm(
      `¿Deseas eliminar la casa de estudios "${item.name}"?`
    );

    if (!confirmed) {
      return;
    }

    this.houseDeletingKey.set(deletingKey);
    this.houseDeleteError.set(null);

    try {
      await firstValueFrom(this.studyHousesService.deleteStudyHouse(sanitizedId, normalizedName));
      const normalizedTarget = normalizedName.trim().toLocaleLowerCase('es');
      const targetId = sanitizedId;

      this.houses.update((entries) =>
        entries.filter((current) => {
          if (targetId && current.id) {
            return current.id !== targetId;
          }

          return current.name.trim().toLocaleLowerCase('es') !== normalizedTarget;
        })
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo eliminar la casa de estudios.';
      this.houseDeleteError.set(message);
    } finally {
      this.houseDeletingKey.set(null);
    }
  }
}
