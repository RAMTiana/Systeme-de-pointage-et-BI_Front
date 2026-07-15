import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ServiceOut } from '../models/service.model';

export interface ServicePayload {
  nom_service?: string;
  description?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ServiceReferentielService {
  private readonly base = `${environment.apiUrl}/divisions`;

  constructor(private readonly http: HttpClient) {}

  lister(recherche?: string): Observable<ServiceOut[]> {
    let params = new HttpParams();
    if (recherche) {
      params = params.set('recherche', recherche);
    }
    return this.http.get<ServiceOut[]>(this.base, { params });
  }

  obtenir(idService: number): Observable<ServiceOut> {
    return this.http.get<ServiceOut>(`${this.base}/${idService}`);
  }

  creer(payload: ServicePayload): Observable<ServiceOut> {
    return this.http.post<ServiceOut>(this.base, payload);
  }

  modifier(idService: number, payload: ServicePayload): Observable<ServiceOut> {
    return this.http.patch<ServiceOut>(`${this.base}/${idService}`, payload);
  }

  supprimer(idService: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${idService}`);
  }
}
