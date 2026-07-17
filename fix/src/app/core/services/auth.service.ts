import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, shareReplay, tap, catchError, of, finalize } from 'rxjs';

import { environment } from '../../../environments/environment';
import { SKIP_AUTH_REFRESH } from '../interceptors/auth.interceptor';
import { Token, UtilisateurCourant } from '../models/auth.model';

const ACCESS_TOKEN_KEY = 'srb_access_token';
const REFRESH_TOKEN_KEY = 'srb_refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _utilisateur = signal<UtilisateurCourant | null>(null);
  readonly utilisateur = this._utilisateur.asReadonly();

  readonly permissions = computed<Set<string>>(
    () => new Set(this._utilisateur()?.role.permissions.map((p) => p.nom_permission) ?? [])
  );

  /** Observable de rafraîchissement partagé pour sérialiser les 401 concurrents. */
  private rafraichissementEnCours: Observable<Token> | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router
  ) {}

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  get estConnecte(): boolean {
    return !!this.accessToken;
  }

  hasPermission(nomPermission: string): boolean {
    return this.permissions().has(nomPermission);
  }

  login(identifiant: string, motDePasse: string): Observable<Token> {
    const body = new URLSearchParams();
    body.set('username', identifiant);
    body.set('password', motDePasse);

    return this.http
      .post<Token>(`${environment.apiUrl}/auth/login`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .pipe(tap((token) => this.stockerJetons(token)));
  }

  chargerProfil(): Observable<UtilisateurCourant> {
    return this.http
      .get<UtilisateurCourant>(`${environment.apiUrl}/auth/me`)
      .pipe(tap((utilisateur) => this._utilisateur.set(utilisateur)));
  }

  /**
   * Rotation du refresh token. Sérialisé : deux 401 simultanés partagent le
   * même appel HTTP, évitant que la rotation stricte du backend n'invalide
   * la seconde requête.
   */
  rafraichirToken(): Observable<Token> {
    if (this.rafraichissementEnCours) {
      return this.rafraichissementEnCours;
    }

    this.rafraichissementEnCours = this.http
      .post<Token>(
        `${environment.apiUrl}/auth/refresh`,
        { refresh_token: this.refreshToken },
        { context: new HttpContext().set(SKIP_AUTH_REFRESH, true) }
      )
      .pipe(
        tap((token) => this.stockerJetons(token)),
        finalize(() => {
          this.rafraichissementEnCours = null;
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );

    return this.rafraichissementEnCours;
  }

  loginGoogle(idToken: string): Observable<Token> {
    return this.http
      .post<Token>(`${environment.apiUrl}/auth/google`, { id_token: idToken })
      .pipe(tap((token) => this.stockerJetons(token)));
  }

  demanderReinitialisation(identifiant: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${environment.apiUrl}/auth/mot-de-passe-oublie`, { identifiant });
  }

  reinitialiserMotDePasse(identifiant: string, code: string, nouveauMotDePasse: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${environment.apiUrl}/auth/reinitialiser-mot-de-passe`, {
      identifiant,
      code,
      nouveau_mot_de_passe: nouveauMotDePasse,
    });
  }

  /**
   * Déconnexion : notifie le backend (blacklist access token + révocation
   * refresh) PUIS purge l'état local, quelle que soit l'issue du POST.
   * SKIP_AUTH_REFRESH évite qu'un 401 déclenche une boucle refresh->logout.
   */
  deconnexion(): void {
    const token = this.accessToken;
    const purger = () => {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      this._utilisateur.set(null);
      this.rafraichissementEnCours = null;
      this.router.navigate(['/connexion']);
    };

    if (!token) {
      purger();
      return;
    }

    this.http
      .post<{ message: string }>(
        `${environment.apiUrl}/auth/logout`,
        {},
        { context: new HttpContext().set(SKIP_AUTH_REFRESH, true) }
      )
      .pipe(catchError(() => of(null)))
      .subscribe(() => purger());
  }

  private stockerJetons(token: Token): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, token.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, token.refresh_token);
  }
}
