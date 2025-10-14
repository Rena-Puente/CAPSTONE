import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { ProfileService, ProfileStatus } from '../../services/profile.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly profile = signal<ProfileStatus | null>(null);

  protected readonly hasProfile = computed(() => this.profile() !== null);
  protected readonly isComplete = computed(() => this.profile()?.isComplete ?? false);
  protected readonly missingFields = computed(() => this.profile()?.missingFields ?? []);

  async ngOnInit(): Promise<void> {
    await this.loadProfileStatus();
  }

  protected async retry(): Promise<void> {
    await this.loadProfileStatus();
  }

  private async loadProfileStatus(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const isAuthenticated = await firstValueFrom(this.authService.ensureAuthenticated());

      if (!isAuthenticated) {
        throw new Error('La sesión ha expirado. Vuelve a iniciar sesión.');
      }

      const status = await firstValueFrom(this.profileService.getProfileStatus());
      this.profile.set(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo consultar el estado del perfil.';
      this.errorMessage.set(message);
      this.profile.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}