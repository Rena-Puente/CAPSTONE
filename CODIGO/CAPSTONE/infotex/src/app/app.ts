import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule,RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly title = signal('Infotex');
  protected readonly isAuthenticated = computed(() => this.authService.isAuthenticated());

  protected logout(): void {
    this.authService.logout();
    void this.router.navigate(['/welcome']);
  }
}
