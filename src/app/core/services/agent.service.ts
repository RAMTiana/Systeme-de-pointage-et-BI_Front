import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AffectationCreate,
  AffectationOut,
  AgentCreate,
  AgentDetailOut,
  AgentOut,
  AgentUpdate,
  Page,
  StatutAgent,
} from '../models/agent.model';

export interface FiltresAgents {
  recherche?: string;
  id_service?: number | null;
  statut?: StatutAgent | null;
  skip?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AgentService {
  private readonly base = `${environment.apiUrl}/agents`;

  constructor(private readonly http: HttpClient) {}

  lister(filtres: FiltresAgents): Observable<Page<AgentOut>> {
    let params = new HttpParams()
      .set('skip', filtres.skip ?? 0)
      .set('limit', filtres.limit ?? 50);
    if (filtres.recherche) params = params.set('recherche', filtres.recherche);
    if (filtres.id_service) params = params.set('id_service', filtres.id_service);
    if (filtres.statut) params = params.set('statut', filtres.statut);

    return this.http.get<Page<AgentOut>>(this.base, { params });
  }

  obtenir(idAgent: number): Observable<AgentDetailOut> {
    return this.http.get<AgentDetailOut>(`${this.base}/${idAgent}`);
  }

  creer(payload: AgentCreate): Observable<AgentOut> {
    return this.http.post<AgentOut>(this.base, payload);
  }

  modifier(idAgent: number, payload: AgentUpdate): Observable<AgentOut> {
    return this.http.patch<AgentOut>(`${this.base}/${idAgent}`, payload);
  }

  desactiver(idAgent: number): Observable<AgentOut> {
    return this.http.post<AgentOut>(`${this.base}/${idAgent}/desactiver`, {});
  }

  reactiver(idAgent: number): Observable<AgentOut> {
    return this.http.post<AgentOut>(`${this.base}/${idAgent}/reactiver`, {});
  }

  definirConsentementFacial(idAgent: number, consentement: boolean): Observable<AgentOut> {
    return this.http.put<AgentOut>(`${this.base}/${idAgent}/consentement-facial`, {
      consentement_facial: consentement,
    });
  }

  supprimer(idAgent: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${idAgent}`);
  }

  ajouterAffectation(idAgent: number, payload: AffectationCreate): Observable<AffectationOut> {
    return this.http.post<AffectationOut>(`${this.base}/${idAgent}/affectations`, payload);
  }

  terminerAffectation(idAgent: number, idAffectation: number): Observable<AffectationOut> {
    return this.http.delete<AffectationOut>(`${this.base}/${idAgent}/affectations/${idAffectation}`);
  }
}
