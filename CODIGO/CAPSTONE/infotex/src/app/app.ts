import { CommonModule, NgIf } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import {
  ADMIN_USER_TYPE,
  CANDIDATE_USER_TYPE,
  COMPANY_USER_TYPE
} from './constants/user-type-routing';

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
  protected readonly userType = computed(() => this.session()?.userType ?? null);
  protected readonly isCandidate = computed(() => this.userType() === CANDIDATE_USER_TYPE);
  protected readonly isCompany = computed(() => this.userType() === COMPANY_USER_TYPE);
  protected readonly isAdmin = computed(() => this.userType() === ADMIN_USER_TYPE);
  protected readonly companyUserType = COMPANY_USER_TYPE;
  protected logout(): void {
    this.authService.logout();
    void this.router.navigate(['/welcome']);
  }
  currentYear = new Date().getFullYear();
}

