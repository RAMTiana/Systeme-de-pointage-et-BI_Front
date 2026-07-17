import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Page } from '../models/agent.model';
import { PointageOut, StatutPointage, TypePointage } from '../models/pointage.model';

interface PointageResponse {
  pointage: PointageOut;
  anomalie_detectee?: string | null;
}

// Note : l'API /pointage ne propose pas de filtre par mode de pointage ni de recherche
// texte par agent (cf. app/api/v1/pointage.py côté back). Ces deux critères sont donc
// appliqués côté client, sur la page courante, dans le composant.
export interface FiltresPointages {
  id_agent?: number | null;
  id_service?: number | null;
  type_pointage?: TypePointage | null;
  statut?: StatutPointage | null;
  date_debut?: string | null;
  date_fin?: string | null;
  skip?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class PointageService {
  private readonly base = `${environment.apiUrl}/pointage`;

  constructor(private readonly http: HttpClient) {}

  lister(filtres: FiltresPointages): Observable<Page<PointageOut>> {
    let params = new HttpParams()
      .set('skip', filtres.skip ?? 0)
      .set('limit', filtres.limit ?? 50);
    if (filtres.id_agent) params = params.set('id_agent', filtres.id_agent);
    if (filtres.id_service) params = params.set('id_service', filtres.id_service);
    if (filtres.type_pointage) params = params.set('type_pointage', filtres.type_pointage);
    if (filtres.statut) params = params.set('statut', filtres.statut);
    if (filtres.date_debut) params = params.set('date_debut', filtres.date_debut);
    if (filtres.date_fin) params = params.set('date_fin', filtres.date_fin);

    return this.http.get<Page<PointageOut>>(this.base, { params });
  }

  obtenir(idPointage: number): Observable<PointageOut> {
    return this.http.get<PointageOut>(`${this.base}/${idPointage}`);
  }

  pointer(mode: 'qr' | 'badge' | 'facial', payload: Record<string, unknown>, deviceKey: string): Observable<PointageResponse> {
    const headers = new HttpHeaders({ 'X-Device-Key': deviceKey });
    return this.http.post<PointageResponse>(`${this.base}/${mode}`, payload, { headers });
  }
}
