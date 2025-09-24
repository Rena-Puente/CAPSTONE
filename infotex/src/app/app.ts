import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';

import { LoginDialogComponent, LoginResult } from './pages/auth/login-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent {
  isLoggedIn = signal(false);

  constructor(private dialog: Dialog) {}

  private isLoginResult(x: unknown): x is LoginResult {
    return !!x && typeof (x as any).success === 'boolean';
  }

  onLoginBtnClick(): void {
    const ref = this.dialog.open(LoginDialogComponent, {
      disableClose: true,
      panelClass: 'login-panel',        // importante para CSS
      backdropClass: 'login-backdrop',  // importante para CSS
    });

    ref.closed.subscribe((value) => {
      if (this.isLoginResult(value) && value.success) {
        this.isLoggedIn.set(true);
      }
    });
  }

  logout(): void {
    this.isLoggedIn.set(false);
  }
}
