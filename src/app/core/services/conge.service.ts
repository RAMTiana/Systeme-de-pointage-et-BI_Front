import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Page } from '../models/agent.model';
import { CongeCreateRequest, CongeOut, StatutConge, TypeConge } from '../models/conge.model';

export interface FiltresConges {
  id_agent?: number | null;
  id_service?: number | null;
  statut?: StatutConge | null;
  type_conge?: TypeConge | null;
  date_debut?: string | null;
  date_fin?: string | null;
  skip?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class CongeService {
  private readonly base = `${environment.apiUrl}/conges`;

  constructor(private readonly http: HttpClient) {}

  lister(filtres: FiltresConges): Observable<Page<CongeOut>> {
    let params = new HttpParams()
      .set('skip', filtres.skip ?? 0)
      .set('limit', filtres.limit ?? 50);
    if (filtres.id_agent) params = params.set('id_agent', filtres.id_agent);
    if (filtres.id_service) params = params.set('id_service', filtres.id_service);
    if (filtres.statut) params = params.set('statut', filtres.statut);
    if (filtres.type_conge) params = params.set('type_conge', filtres.type_conge);
    if (filtres.date_debut) params = params.set('date_debut', filtres.date_debut);
    if (filtres.date_fin) params = params.set('date_fin', filtres.date_fin);

    return this.http.get<Page<CongeOut>>(this.base, { params });
  }

  obtenir(idConge: number): Observable<CongeOut> {
    return this.http.get<CongeOut>(`${this.base}/${idConge}`);
  }

  creer(payload: CongeCreateRequest): Observable<CongeOut> {
    return this.http.post<CongeOut>(this.base, payload);
  }

  annuler(idConge: number): Observable<CongeOut> {
    return this.http.put<CongeOut>(`${this.base}/${idConge}/annulation`, {});
  }
}
