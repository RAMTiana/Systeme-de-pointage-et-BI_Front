import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ParametreOut, ParametreUpdate } from '../models/parametre.model';

@Injectable({ providedIn: 'root' })
export class ParametreService {
  private readonly base = `${environment.apiUrl}/parametres`;

  constructor(private readonly http: HttpClient) {}

  lister(): Observable<ParametreOut[]> {
    return this.http.get<ParametreOut[]>(this.base);
  }

  obtenir(nomParametre: string): Observable<ParametreOut> {
    return this.http.get<ParametreOut>(`${this.base}/${nomParametre}`);
  }

  modifier(nomParametre: string, payload: ParametreUpdate): Observable<ParametreOut> {
    return this.http.put<ParametreOut>(`${this.base}/${nomParametre}`, payload);
  }
}
