import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
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
  protected readonly isDropdownOpen = signal(false);

  protected toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isDropdownOpen.update((isOpen) => !isOpen);
  }

  protected closeDropdown(): void {
    this.isDropdownOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.profile-dropdown')) {
      this.closeDropdown();
    }
  }

  protected logout(): void {
    this.closeDropdown();
    this.authService.logout();
    void this.router.navigate(['/welcome']);
  }
}
