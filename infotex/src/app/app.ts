import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Dialog, DialogModule } from '@angular/cdk/dialog';

import { LoginDialogComponent, LoginResult } from './pages/auth/login-dialog.component';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, FormsModule, DialogModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent {
  // Puedes usar auth.isLoggedIn() en el template (signal boolean)
  public auth = inject(AuthService);

  private dialog = inject(Dialog);
  private router = inject(Router);

  private isLoginResult(x: unknown): x is LoginResult {
    return !!x && typeof (x as any).success === 'boolean';
  }

  onLoginBtnClick(): void {
    const ref = this.dialog.open(LoginDialogComponent, {
      disableClose: true,
      panelClass: 'login-panel',
      backdropClass: 'login-backdrop',
    });

    ref.closed.subscribe((value) => {
      if (this.isLoginResult(value) && value.success) {
        // El diálogo ya guardó el accessToken en AuthService → solo navega
        this.router.navigateByUrl('/profile');
      }
    });
  }

  logout(): void {
    // Revoca en backend, limpia token en memoria y navega
    this.auth.logout().subscribe({
      next: () => this.router.navigateByUrl('/welcome'),
      error: () => this.router.navigateByUrl('/welcome'),
    });
  }
}
