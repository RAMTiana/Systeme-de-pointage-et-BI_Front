import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ClassementAgentOut,
  ComparaisonServicesOut,
  CritereClassement,
  PointTendance,
  PrevisionOut,
  TableauBordTempsReel,
  TypePeriode,
} from '../models/bi.model';

@Injectable({ providedIn: 'root' })
export class BiService {
  private readonly base = `${environment.apiUrl}/bi`;

  constructor(private readonly http: HttpClient) {}

  private paramsSansVides(valeurs: Record<string, string | number | undefined | null>): HttpParams {
    let params = new HttpParams();
    for (const [cle, valeur] of Object.entries(valeurs)) {
      if (valeur !== undefined && valeur !== null && valeur !== '') {
        params = params.set(cle, valeur);
      }
    }
    return params;
  }

  tempsReel(idService?: number, jour?: string): Observable<TableauBordTempsReel> {
    return this.http.get<TableauBordTempsReel>(`${this.base}/temps-reel`, {
      params: this.paramsSansVides({ id_service: idService, jour }),
    });
  }

  tendances(dateDebut: string, dateFin: string, granularite: TypePeriode = 'jour', idService?: number): Observable<PointTendance[]> {
    return this.http.get<PointTendance[]>(`${this.base}/tendances`, {
      params: this.paramsSansVides({ date_debut: dateDebut, date_fin: dateFin, granularite, id_service: idService }),
    });
  }

  classement(
    dateDebut: string,
    dateFin: string,
    critere: CritereClassement = 'ponctualite',
    limite = 10,
    idService?: number
  ): Observable<ClassementAgentOut[]> {
    return this.http.get<ClassementAgentOut[]>(`${this.base}/classement`, {
      params: this.paramsSansVides({ date_debut: dateDebut, date_fin: dateFin, critere, limite, id_service: idService }),
    });
  }

  comparaisonServices(typePeriode: TypePeriode = 'mois', dateReference?: string): Observable<ComparaisonServicesOut> {
    return this.http.get<ComparaisonServicesOut>(`${this.base}/comparaison-services`, {
      params: this.paramsSansVides({ type_periode: typePeriode, date_reference: dateReference }),
    });
  }

  prevision(
    granularite: TypePeriode = 'mois',
    idService?: number,
    nombrePeriodesHistorique = 6,
    horizon = 3
  ): Observable<PrevisionOut> {
    return this.http.get<PrevisionOut>(`${this.base}/prevision`, {
      params: this.paramsSansVides({
        granularite,
        id_service: idService,
        nombre_periodes_historique: nombrePeriodesHistorique,
        horizon,
      }),
    });
  }
}
