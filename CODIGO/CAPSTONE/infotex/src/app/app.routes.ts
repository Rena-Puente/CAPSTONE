import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { About } from './pages/about/about';
import { Welcome } from './pages/welcome/welcome';
import { Profile } from './pages/profile/profile';
import { CompanyCreate } from './pages/company/company-create';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { GithubCallback } from './pages/auth/github-callback/github-callback';

export const routes: Routes = [
  { path: 'home', component: Home, canActivate: [authGuard] },
  { path: 'about', component: About, canActivate: [authGuard] },
  { path: 'profile', component: Profile, canActivate: [authGuard] },
  { path: 'companies/create', component: CompanyCreate, canActivate: [authGuard] },
  { path: 'welcome', component: Welcome, canActivate: [guestGuard] },
  { path: 'auth/github/callback', component: GithubCallback },
  {
    path: 'user/:slug',
    loadComponent: () =>
      import('./pages/profile/public-profile/public-profile').then((m) => m.PublicProfile),
    data: { title: 'Perfil público' }
  },
  { path: '', redirectTo: 'welcome', pathMatch: 'full' }
];

