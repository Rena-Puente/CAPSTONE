import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { About } from './pages/about/about';
import { Welcome } from './pages/welcome/welcome';
import { Profile } from './pages/profile/profile';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';

export const routes: Routes = [
  { path: 'home', component: Home, canActivate: [authGuard] },
  { path: 'about', component: About, canActivate: [authGuard] },
  { path: 'profile', component: Profile, canActivate: [authGuard] },
  { path: 'welcome', component: Welcome, canActivate: [guestGuard] },
  { path: '', redirectTo: 'welcome', pathMatch: 'full' }
];

