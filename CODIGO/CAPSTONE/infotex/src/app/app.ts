import { CommonModule, NgIf } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule,NgIf,RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sessionState = this.authService.getSessionSignal();
  protected readonly title = signal('Infotex');
  protected readonly isAuthenticated = computed(() => this.authService.isAuthenticated());
  protected readonly session = computed(() => this.sessionState());
  protected readonly userId = computed(() => this.session()?.userId ?? null);
  protected readonly isUser1 = computed(() => this.userId() === 1);
  protected readonly isUser2 = computed(() => this.userId() === 2);
  protected logout(): void {
    this.authService.logout();
    void this.router.navigate(['/welcome']);
  }
}
