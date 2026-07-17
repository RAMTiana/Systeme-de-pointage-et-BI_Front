import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Page } from '../models/agent.model';
import {
  MotDePasseAdminUpdate,
  RoleChangeRequest,
  RoleOut,
  UtilisateurAdminOut,
  UtilisateurCreate,
  UtilisateurUpdate,
} from '../models/utilisateur-admin.model';

export interface FiltresUtilisateurs {
  recherche?: string;
  id_role?: number | null;
  actif?: boolean | null;
  skip?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class UtilisateurAdminService {
  private readonly base = `${environment.apiUrl}/utilisateurs`;

  constructor(private readonly http: HttpClient) {}

  lister(filtres: FiltresUtilisateurs): Observable<Page<UtilisateurAdminOut>> {
    let params = new HttpParams()
      .set('skip', filtres.skip ?? 0)
      .set('limit', filtres.limit ?? 50);
    if (filtres.recherche) params = params.set('recherche', filtres.recherche);
    if (filtres.id_role) params = params.set('id_role', filtres.id_role);
    if (filtres.actif !== null && filtres.actif !== undefined) params = params.set('actif', filtres.actif);

    return this.http.get<Page<UtilisateurAdminOut>>(this.base, { params });
  }

  listerRoles(): Observable<RoleOut[]> {
    return this.http.get<RoleOut[]>(`${this.base}/roles`);
  }

  obtenir(idUtilisateur: number): Observable<UtilisateurAdminOut> {
    return this.http.get<UtilisateurAdminOut>(`${this.base}/${idUtilisateur}`);
  }

  creer(payload: UtilisateurCreate): Observable<UtilisateurAdminOut> {
    return this.http.post<UtilisateurAdminOut>(this.base, payload);
  }

  modifier(idUtilisateur: number, payload: UtilisateurUpdate): Observable<UtilisateurAdminOut> {
    return this.http.patch<UtilisateurAdminOut>(`${this.base}/${idUtilisateur}`, payload);
  }

  changerRole(idUtilisateur: number, payload: RoleChangeRequest): Observable<UtilisateurAdminOut> {
    return this.http.put<UtilisateurAdminOut>(`${this.base}/${idUtilisateur}/role`, payload);
  }

  desactiver(idUtilisateur: number): Observable<UtilisateurAdminOut> {
    return this.http.post<UtilisateurAdminOut>(`${this.base}/${idUtilisateur}/desactiver`, {});
  }

  reactiver(idUtilisateur: number): Observable<UtilisateurAdminOut> {
    return this.http.post<UtilisateurAdminOut>(`${this.base}/${idUtilisateur}/reactiver`, {});
  }

  reinitialiserMotDePasse(idUtilisateur: number, payload: MotDePasseAdminUpdate): Observable<UtilisateurAdminOut> {
    return this.http.put<UtilisateurAdminOut>(`${this.base}/${idUtilisateur}/mot-de-passe`, payload);
  }

  supprimer(idUtilisateur: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${idUtilisateur}`);
  }
}
