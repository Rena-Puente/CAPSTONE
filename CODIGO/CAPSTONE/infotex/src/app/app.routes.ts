import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { About } from './pages/about/about';
import { Welcome } from './pages/welcome/welcome';
import { Profile } from './pages/profile/profile';
import { CompanyCreate } from './pages/company/company-create';
import { CompanyDashboard } from './pages/company/company-dashboard';
import { CompanyProfile } from './pages/company/company-profile';
import { CompanyOfferCreate } from './pages/company/company-offer-create';
import { CompanyApplicants } from './pages/company/company-applicants';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { GithubCallback } from './pages/auth/github-callback/github-callback';
import { VerifyEmail } from './pages/auth/verify-email/verify-email';
import { companyGuard } from './guards/company.guard';
import { adminGuard } from './guards/admin.guard';
import { AdminCareers } from './pages/admin/admin-careers';
import { ResumenAnual } from './pages/admin/resumen-anual/resumen-anual';
import { Aplications } from './pages/aplications/aplications';
import { ForgotPassword } from './pages/auth/forgot-password/forgot-password';
import { ResetPassword } from './pages/auth/reset-password/reset-password';

export const routes: Routes = [
  { path: 'home', component: Home, canActivate: [authGuard] },
  { path: 'about', component: About },
  { path: 'profile', component: Profile, canActivate: [authGuard] },
  { path: 'applications', component: Aplications, canActivate: [authGuard] },
  { path: 'companies/create', component: CompanyCreate, canActivate: [authGuard] },
  {
    path: 'companies',
    component: CompanyDashboard,
    canActivate: [authGuard, companyGuard],
    children: [
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
      { path: 'profile', component: CompanyProfile, canActivate: [authGuard, companyGuard] },
      { path: 'offers/new', component: CompanyOfferCreate, canActivate: [authGuard, companyGuard] },
      { path: 'applicants', component: CompanyApplicants, canActivate: [authGuard, companyGuard] }
    ]
  },
  { path: 'admin/careers', component: AdminCareers, canActivate: [authGuard, adminGuard] },
  { path: 'admin/resumen-anual', component: ResumenAnual, canActivate: [authGuard, adminGuard] },
  { path: 'welcome', component: Welcome, canActivate: [guestGuard] },
  { path: 'auth/forgot-password', component: ForgotPassword, canActivate: [guestGuard] },
  { path: 'auth/reset-password', component: ResetPassword, canActivate: [guestGuard] },
  { path: 'auth/github/callback', component: GithubCallback },
  { path: 'auth/verify-email', component: VerifyEmail },
  {
    path: 'user/:slug',
    loadComponent: () =>
      import('./pages/profile/public-profile/public-profile').then((m) => m.PublicProfile),
    data: { title: 'Perfil público' }
  },
  { path: '', redirectTo: 'welcome', pathMatch: 'full' }
];

