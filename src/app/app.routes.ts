import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'connexion',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },
      {
        path: 'tableau-de-bord',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'agents',
        loadComponent: () => import('./features/agents/agents-list/agents-list.component').then((m) => m.AgentsListComponent),
      },
      {
        path: 'divisions',
        loadComponent: () =>
          import('./features/services/services-list/services-list.component').then((m) => m.ServicesListComponent),
      },
      {
        path: 'services',
        redirectTo: 'divisions',
        pathMatch: 'full',
      },
      {
        path: 'pointage',
        loadComponent: () =>
          import('./features/pointage/pointage-list/pointage-list.component').then((m) => m.PointageListComponent),
      },
      {
        path: 'anomalies',
        loadComponent: () =>
          import('./features/anomalies/anomalies-list/anomalies-list.component').then(
            (m) => m.AnomaliesListComponent
          ),
      },
      {
        path: 'rapports',
        loadComponent: () =>
          import('./features/rapports/rapports-list/rapports-list.component').then((m) => m.RapportsListComponent),
      },
      {
        path: 'utilisateurs',
        loadComponent: () =>
          import('./features/utilisateurs/utilisateurs-list/utilisateurs-list.component').then(
            (m) => m.UtilisateursListComponent
          ),
      },
      {
        path: 'parametres',
        loadComponent: () =>
          import('./features/parametres/parametres-list/parametres-list.component').then(
            (m) => m.ParametresListComponent
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'connexion' },
];
