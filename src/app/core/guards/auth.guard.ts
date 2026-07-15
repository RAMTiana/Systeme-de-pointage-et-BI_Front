import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.estConnecte) {
    return router.parseUrl('/connexion');
  }

  // Le profil (rôle + permissions) est nécessaire à l'affichage RBAC de
  // l'interface (menu, boutons) : on le charge une fois si absent, par
  // exemple après un rechargement de page.
  if (authService.utilisateur()) {
    return true;
  }

  return authService.chargerProfil().pipe(
    map(() => true),
    catchError(() => of(router.parseUrl('/connexion')))
  );
};
