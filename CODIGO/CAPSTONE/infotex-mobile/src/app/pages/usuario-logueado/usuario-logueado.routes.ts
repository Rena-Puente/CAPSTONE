import { Routes } from '@angular/router';
import { UsuarioLogueadoPage } from './usuario-logueado.page';
import { candidateGuard } from '../../core/guards/candidate.guard';
import { companyGuard } from '../../core/guards/company.guard';

export const routes: Routes = [
  {
    path: '',
    component: UsuarioLogueadoPage,
    children: [
      {
        path: 'empleos',
        loadComponent: () =>
          import('../empleos/empleos.page').then((m) => m.EmpleosPage),
      },
      {
        path: 'mis-empleos',
        canActivate: [companyGuard],
        loadComponent: () =>
          import('../mis-empleos/mis-empleos.page').then((m) => m.MisEmpleosPage),
      },
      {
        path: 'mis-postulaciones',
        canActivate: [candidateGuard],
        loadComponent: () =>
          import('../mis-postulaciones/mis-postulaciones.page').then(
            (m) => m.MisPostulacionesPage
          ),
      },
      {
        path: 'mi-perfil',
        loadComponent: () =>
          import('../mi-perfil/mi-perfil.page').then((m) => m.MiPerfilPage),
      },
      {
        path: '',
        redirectTo: '/usuario-logueado/empleos',
        pathMatch: 'full',
      },
    ],
  },
];
