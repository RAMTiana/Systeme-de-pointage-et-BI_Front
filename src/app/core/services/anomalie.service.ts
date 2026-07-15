import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Page } from '../models/agent.model';
import { AnomalieDetailOut, AnomalieExamenRequest, StatutJustification, TypeAnomalie } from '../models/anomalie.model';

export interface FiltresAnomalies {
  id_agent?: number | null;
  id_service?: number | null;
  type_anomalie?: TypeAnomalie | null;
  statut_justification?: StatutJustification | null;
  date_debut?: string | null;
  date_fin?: string | null;
  skip?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AnomalieService {
  private readonly base = `${environment.apiUrl}/anomalies`;

  constructor(private readonly http: HttpClient) {}

  lister(filtres: FiltresAnomalies): Observable<Page<AnomalieDetailOut>> {
    let params = new HttpParams()
      .set('skip', filtres.skip ?? 0)
      .set('limit', filtres.limit ?? 50);
    if (filtres.id_agent) params = params.set('id_agent', filtres.id_agent);
    if (filtres.id_service) params = params.set('id_service', filtres.id_service);
    if (filtres.type_anomalie) params = params.set('type_anomalie', filtres.type_anomalie);
    if (filtres.statut_justification) params = params.set('statut_justification', filtres.statut_justification);
    if (filtres.date_debut) params = params.set('date_debut', filtres.date_debut);
    if (filtres.date_fin) params = params.set('date_fin', filtres.date_fin);

    return this.http.get<Page<AnomalieDetailOut>>(this.base, { params });
  }

  obtenir(idAnomalie: number): Observable<AnomalieDetailOut> {
    return this.http.get<AnomalieDetailOut>(`${this.base}/${idAnomalie}`);
  }

  examiner(idAnomalie: number, payload: AnomalieExamenRequest): Observable<AnomalieDetailOut> {
    return this.http.put<AnomalieDetailOut>(`${this.base}/${idAnomalie}/examen`, payload);
  }
}
