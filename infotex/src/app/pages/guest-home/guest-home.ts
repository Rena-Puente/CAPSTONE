import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { LoginDialogComponent } from '../auth/login-dialog.component';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-guest-home',
  imports: [CommonModule],
  templateUrl: './guest-home.html',
  styleUrls: ['./guest-home.css']
})
export class GuestHome {
  private dialog = inject(Dialog);
  private router = inject(Router);
  private auth = inject(AuthService);

  openLogin() {
    const ref = this.dialog.open(LoginDialogComponent, {
      disableClose: true,
      panelClass: 'login-panel',
      backdropClass: 'login-backdrop',
    });

    ref.closed.subscribe((res: any) => {
      if (res?.success) {
        // Ya se guardó el accessToken en AuthService dentro del diálogo
        // Solo navegamos a la página protegida
        this.router.navigateByUrl('/profile');
      }
    });
  }
}
