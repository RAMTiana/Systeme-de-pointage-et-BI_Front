import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/** Marque une requête pour qu'elle ne déclenche jamais de tentative de rafraîchissement (évite les boucles). */
export const SKIP_AUTH_REFRESH = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  // On ne touche qu'aux appels vers notre propre API.
  const estApiInterne = req.url.startsWith(environment.apiUrl);
  const token = authService.accessToken;

  const requete = estApiInterne && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(requete).pipe(
    catchError((erreur: HttpErrorResponse) => {
      const doitTenterRafraichissement =
        estApiInterne &&
        erreur.status === 401 &&
        !req.context.get(SKIP_AUTH_REFRESH) &&
        !!authService.refreshToken;

      if (!doitTenterRafraichissement) {
        return throwError(() => erreur);
      }

      return authService.rafraichirToken().pipe(
        switchMap((nouveauToken) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${nouveauToken.access_token}` } }))
        ),
        catchError((erreurRafraichissement) => {
          authService.deconnexion();
          return throwError(() => erreurRafraichissement);
        })
      );
    })
  );
};
