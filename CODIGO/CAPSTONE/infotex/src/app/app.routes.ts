import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { About } from './pages/about/about';
import { Welcome } from './pages/welcome/welcome';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'home', component: Home, canActivate: [authGuard] },
  { path: 'about', component: About, canActivate: [authGuard] },
  { path: 'welcome', component: Welcome },
  { path: '', redirectTo: 'welcome', pathMatch: 'full' }
];
