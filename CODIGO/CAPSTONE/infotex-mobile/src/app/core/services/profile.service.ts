import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { API_BASE } from '../../../environments/environment';

export interface ProfileInfo {
  displayName: string;
  career: string;
  biography: string;
  country: string;
  city: string;
  phoneNumber: string;
  avatarUrl: string;
  slug: string;
}

export interface ProfileEducationEntry {
  id: number;
  institution: string;
  grado: string;
  fieldOfStudy: string;
  startDate: string | null;
  endDate: string | null;
  description: string;
}

export interface ProfileExperienceEntry {
  id: number;
  title: string;
  company: string;
  startDate: string | null;
  endDate: string | null;
  location: string;
  description: string;
}

export interface ProfileSkillEntry {
  id: number;
  name: string;
  category: string;
  level: number;
  yearsExperience: number;
  endorsementCount: number;
}

export interface UserProfileData {
  profile: ProfileInfo;
  education: ProfileEducationEntry[];
  experience: ProfileExperienceEntry[];
  skills: ProfileSkillEntry[];
}

interface RawCollection<T> {
  entries?: T[] | null;
}

interface RawProfileResponse {
  profile?: Partial<ProfileInfo> | null;
  education?: RawCollection<Partial<ProfileEducationEntry>> | null;
  experience?: RawCollection<Partial<ProfileExperienceEntry>> | null;
  skills?: RawCollection<Partial<ProfileSkillEntry>> | null;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  getProfile(slug: string): Observable<UserProfileData> {
    return this.http
      .get<RawProfileResponse>(`${API_BASE}/profiles/${slug}`)
      .pipe(map((response) => this.normalizeResponse(response)));
  }

  private normalizeResponse(response: RawProfileResponse): UserProfileData {
    const profile = response?.profile ?? {};

    const normalizedProfile: ProfileInfo = {
      displayName: profile.displayName ?? 'Perfil sin nombre',
      career: profile.career ?? 'Sin carrera definida',
      biography: profile.biography ?? 'Sin biografía disponible.',
      country: profile.country ?? 'País no definido',
      city: profile.city ?? 'Ciudad no definida',
      phoneNumber: profile.phoneNumber ?? 'Sin teléfono',
      avatarUrl: profile.avatarUrl ?? '',
      slug: profile.slug ?? '',
    };

    const educationEntries = Array.isArray(response?.education?.entries)
      ? response.education.entries
      : [];

    const experienceEntries = Array.isArray(response?.experience?.entries)
      ? response.experience.entries
      : [];

    const skillEntries = Array.isArray(response?.skills?.entries)
      ? response.skills.entries
      : [];

    return {
      profile: normalizedProfile,
      education: educationEntries.map((entry) => this.normalizeEducation(entry)),
      experience: experienceEntries.map((entry) => this.normalizeExperience(entry)),
      skills: skillEntries.map((entry) => this.normalizeSkill(entry)),
    } satisfies UserProfileData;
  }

  private normalizeEducation(entry: Partial<ProfileEducationEntry> | null | undefined): ProfileEducationEntry {
    const idValue = Number.parseInt(String(entry?.id ?? 0), 10);

    return {
      id: Number.isNaN(idValue) ? 0 : idValue,
      institution: entry?.institution ?? 'Institución no especificada',
      grado: entry?.grado ?? 'Grado no especificado',
      fieldOfStudy: entry?.fieldOfStudy ?? 'Área de estudio no especificada',
      startDate: entry?.startDate ?? null,
      endDate: entry?.endDate ?? null,
      description: entry?.description ?? 'Sin descripción',
    } satisfies ProfileEducationEntry;
  }

  private normalizeExperience(
    entry: Partial<ProfileExperienceEntry> | null | undefined
  ): ProfileExperienceEntry {
    const idValue = Number.parseInt(String(entry?.id ?? 0), 10);

    return {
      id: Number.isNaN(idValue) ? 0 : idValue,
      title: entry?.title ?? 'Cargo no especificado',
      company: entry?.company ?? 'Empresa no especificada',
      startDate: entry?.startDate ?? null,
      endDate: entry?.endDate ?? null,
      location: entry?.location ?? 'Ubicación no especificada',
      description: entry?.description ?? 'Sin descripción',
    } satisfies ProfileExperienceEntry;
  }

  private normalizeSkill(entry: Partial<ProfileSkillEntry> | null | undefined): ProfileSkillEntry {
    const idValue = Number.parseInt(String(entry?.id ?? 0), 10);
    const levelValue = Number.parseInt(String(entry?.level ?? 0), 10);
    const yearsValue = Number.parseInt(String(entry?.yearsExperience ?? 0), 10);
    const endorsementValue = Number.parseInt(String(entry?.endorsementCount ?? 0), 10);

    return {
      id: Number.isNaN(idValue) ? 0 : idValue,
      name: entry?.name ?? 'Habilidad sin nombre',
      category: entry?.category ?? 'Sin categoría',
      level: Number.isNaN(levelValue) ? 0 : levelValue,
      yearsExperience: Number.isNaN(yearsValue) ? 0 : yearsValue,
      endorsementCount: Number.isNaN(endorsementValue) ? 0 : endorsementValue,
    } satisfies ProfileSkillEntry;
  }
}
