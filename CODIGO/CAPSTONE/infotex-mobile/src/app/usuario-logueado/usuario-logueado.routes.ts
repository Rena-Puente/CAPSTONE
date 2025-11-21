import { Routes } from '@angular/router';
import { UsuarioLogueadoPage } from './usuario-logueado.page';

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
        loadComponent: () =>
          import('../mis-empleos/mis-empleos.page').then((m) => m.MisEmpleosPage),
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
