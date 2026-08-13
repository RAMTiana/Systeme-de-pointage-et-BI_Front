import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'connexion',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    // Poste de pointage public (kiosque) : volontairement SANS authGuard, pour que
    // n'importe quel appareil du bureau puisse l'ouvrir sans compte staff et que les
    // agents pointent en parallèle sur plusieurs postes (fini la file d'attente sur
    // un seul poste tenu par une session connectée). L'authentification de cette page
    // se fait via l'en-tête X-Device-Key (cf. PointageScanComponent / PointageService),
    // pas par un compte utilisateur. À ne déployer que sur le réseau interne du bureau.
    path: 'pointage-kiosk',
    loadComponent: () =>
      import('./features/pointage/pointage-kiosk/pointage-kiosk.component').then((m) => m.PointageKioskComponent),
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
        // Le poste de scan est désormais un onglet intégré à la page Pointage.
        path: 'pointage/scan',
        redirectTo: 'pointage',
        pathMatch: 'full',
      },
      {
        path: 'anomalies',
        loadComponent: () =>
          import('./features/anomalies/anomalies-list/anomalies-list.component').then(
            (m) => m.AnomaliesListComponent
          ),
      },
      {
        path: 'absences',
        loadComponent: () =>
          import('./features/absences/absences-list/absences-list.component').then((m) => m.AbsencesListComponent),
      },
      {
        path: 'conges',
        loadComponent: () =>
          import('./features/conges/conges-list/conges-list.component').then((m) => m.CongesListComponent),
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
      {
        path: 'mon-profil',
        loadComponent: () => import('./features/profil/profil.component').then((m) => m.ProfilComponent),
      },
      {
        path: 'mon-profil',
        loadComponent: () => import('./features/profil/profil.component').then((m) => m.ProfilComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'connexion' },
];
