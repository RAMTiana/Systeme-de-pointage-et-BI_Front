import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface AnalyseAnomaliesRequest {
  id_service?: number | null;
  jours?: number;
}
export interface AnalyseAnomalies {
  periode_debut: string;
  periode_fin: string;
  nombre_anomalies_analysees: number;
  analyse: {
    synthese?: string;
    tendances?: string[];
    agents_a_surveiller?: { agent: string; raison: string }[];
    recommandations_rh?: string[];
  };
}

export interface PrevisionCommenteeRequest {
  id_service?: number | null;
  horizon?: number;
}
export interface PrevisionCommentee {
  prevision: Record<string, unknown>;
  commentaire_ia: {
    resume_executif?: string;
    risques?: string[];
    opportunites?: string[];
    actions_preventives?: string[];
  };
}

export interface RapportAutoRequest {
  id_service?: number | null;
  periode?: 'hebdomadaire' | 'mensuel';
}
export interface RapportAuto {
  periode: string;
  date_debut: string;
  date_fin: string;
  id_service: number | null;
  rapport_markdown: string;
}

export interface QuestionRHRequest {
  question: string;
  id_service?: number | null;
}
export interface QuestionRH {
  question: string;
  reponse: string;
}

@Injectable({ providedIn: 'root' })
export class IaService {
  private readonly base = `${environment.apiUrl}/ia`;

  constructor(private readonly http: HttpClient) {}

  analyserAnomalies(payload: AnalyseAnomaliesRequest): Observable<AnalyseAnomalies> {
    return this.http.post<AnalyseAnomalies>(`${this.base}/analyser-anomalies`, payload);
  }

  previsionCommentee(payload: PrevisionCommenteeRequest): Observable<PrevisionCommentee> {
    return this.http.post<PrevisionCommentee>(`${this.base}/prevision-commentee`, payload);
  }

  rapportAuto(payload: RapportAutoRequest): Observable<RapportAuto> {
    return this.http.post<RapportAuto>(`${this.base}/rapport-auto`, payload);
  }

  questionRH(payload: QuestionRHRequest): Observable<QuestionRH> {
    return this.http.post<QuestionRH>(`${this.base}/question-rh`, payload);
  }
}
