import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Page } from '../models/agent.model';
import { FormatRapport, RapportContenu, RapportGenerateRequest, RapportOut, TypePeriode } from '../models/rapport.model';

export interface FiltresRapports {
  type_periode?: TypePeriode | null;
  format?: FormatRapport | null;
  id_service?: number | null;
  date_debut?: string | null;
  date_fin?: string | null;
  skip?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class RapportService {
  private readonly base = `${environment.apiUrl}/rapports`;

  constructor(private readonly http: HttpClient) {}

  lister(filtres: FiltresRapports): Observable<Page<RapportOut>> {
    let params = new HttpParams()
      .set('skip', filtres.skip ?? 0)
      .set('limit', filtres.limit ?? 50);
    if (filtres.type_periode) params = params.set('type_periode', filtres.type_periode);
    if (filtres.format) params = params.set('format', filtres.format);
    if (filtres.id_service) params = params.set('id_service', filtres.id_service);
    if (filtres.date_debut) params = params.set('date_debut', filtres.date_debut);
    if (filtres.date_fin) params = params.set('date_fin', filtres.date_fin);

    return this.http.get<Page<RapportOut>>(this.base, { params });
  }

  obtenir(idRapport: number): Observable<RapportOut> {
    return this.http.get<RapportOut>(`${this.base}/${idRapport}`);
  }

  obtenirIndicateurs(idRapport: number): Observable<RapportContenu> {
    return this.http.get<RapportContenu>(`${this.base}/${idRapport}/indicateurs`);
  }

  generer(payload: RapportGenerateRequest): Observable<RapportOut> {
    return this.http.post<RapportOut>(`${this.base}/generer`, payload);
  }

  telecharger(idRapport: number): Observable<Blob> {
    return this.http.get(`${this.base}/${idRapport}/telecharger`, { responseType: 'blob' });
  }
}
