import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Page } from '../models/agent.model';
import { AbsenceCreateRequest, AbsenceOut, StatutAbsence } from '../models/absence.model';

export interface FiltresAbsences {
  id_agent?: number | null;
  id_service?: number | null;
  statut?: StatutAbsence | null;
  date_debut?: string | null;
  date_fin?: string | null;
  skip?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AbsenceService {
  private readonly base = `${environment.apiUrl}/absences`;

  constructor(private readonly http: HttpClient) {}

  lister(filtres: FiltresAbsences): Observable<Page<AbsenceOut>> {
    let params = new HttpParams()
      .set('skip', filtres.skip ?? 0)
      .set('limit', filtres.limit ?? 50);
    if (filtres.id_agent) params = params.set('id_agent', filtres.id_agent);
    if (filtres.id_service) params = params.set('id_service', filtres.id_service);
    if (filtres.statut) params = params.set('statut', filtres.statut);
    if (filtres.date_debut) params = params.set('date_debut', filtres.date_debut);
    if (filtres.date_fin) params = params.set('date_fin', filtres.date_fin);

    return this.http.get<Page<AbsenceOut>>(this.base, { params });
  }

  obtenir(idAbsence: number): Observable<AbsenceOut> {
    return this.http.get<AbsenceOut>(`${this.base}/${idAbsence}`);
  }

  creer(payload: AbsenceCreateRequest): Observable<AbsenceOut> {
    return this.http.post<AbsenceOut>(this.base, payload);
  }

  annuler(idAbsence: number): Observable<AbsenceOut> {
    return this.http.put<AbsenceOut>(`${this.base}/${idAbsence}/annulation`, {});
  }
}
