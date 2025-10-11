import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'infotex_is_logged_in';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly loggedIn = signal<boolean>(this.restoreStatus());

  isAuthenticated(): boolean {
    return this.loggedIn();
  }

  login(): void {
    this.loggedIn.set(true);
    localStorage.setItem(STORAGE_KEY, 'true');
  }

  logout(): void {
    this.loggedIn.set(false);
    localStorage.removeItem(STORAGE_KEY);
  }

  private restoreStatus(): boolean {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';
  }
}
