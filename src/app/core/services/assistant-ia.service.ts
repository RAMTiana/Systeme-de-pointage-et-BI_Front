import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AssistantCapaciteOut, AssistantMessageRequest, AssistantMessageResponse } from '../models/assistant-ia.model';

@Injectable({ providedIn: 'root' })
export class AssistantIaService {
  private readonly base = `${environment.apiUrl}/assistant`;

  constructor(private readonly http: HttpClient) {}

  capacites(): Observable<AssistantCapaciteOut[]> {
    return this.http.get<AssistantCapaciteOut[]>(`${this.base}/capacites`);
  }

  envoyerMessage(message: string, idService?: number): Observable<AssistantMessageResponse> {
    const payload: AssistantMessageRequest = { message, id_service: idService };
    return this.http.post<AssistantMessageResponse>(`${this.base}/message`, payload);
  }
}
