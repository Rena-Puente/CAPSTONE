import { Routes } from '@angular/router';
import { GuestHome } from './pages/guest-home/guest-home';
import { About } from './pages/about/about';
import { Home } from './pages/home/home';
import { Profile } from './pages/profile/profile';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  { path: 'welcome', component: GuestHome, canActivate: [guestGuard] },
  { path: 'about', component: About },
  { path: 'home', component: Home, canActivate: [authGuard] },
  { path: 'profile', component: Profile, canActivate: [authGuard] },
  { path: '', redirectTo: 'welcome', pathMatch: 'full' },
  { path: '**', redirectTo: 'welcome' },
];
