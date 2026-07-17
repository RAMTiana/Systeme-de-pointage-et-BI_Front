import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { AnomalieDetailOut, StatutJustification, TypeAnomalie } from '../../../core/models/anomalie.model';
import { ServiceOut } from '../../../core/models/service.model';
import { AnomalieService } from '../../../core/services/anomalie.service';
import { AuthService } from '../../../core/services/auth.service';
import { ServiceReferentielService } from '../../../core/services/service-referentiel.service';

const LIMITE_PAR_PAGE = 20;

@Component({
    selector: 'app-anomalies-list',
    imports: [CommonModule, FormsModule],
    templateUrl: './anomalies-list.component.html'
})
export class AnomaliesListComponent implements OnInit {
  private readonly anomalieService = inject(AnomalieService);
  private readonly serviceReferentiel = inject(ServiceReferentielService);
  private readonly auth = inject(AuthService);

  readonly anomalies = signal<AnomalieDetailOut[]>([]);
  readonly total = signal(0);
  readonly skip = signal(0);
  readonly enChargement = signal(true);
  readonly erreur = signal<string | null>(null);
  readonly services = signal<ServiceOut[]>([]);

  idServiceFiltre: number | null = null;
  typeFiltre: TypeAnomalie | null = null;
  statutFiltre: StatutJustification | null = 'en_attente';
  dateDebut: string | null = null;
  dateFin: string | null = null;

  readonly anomalieSelectionnee = signal<AnomalieDetailOut | null>(null);
  motif = '';
  pieceJointe = '';
  readonly enTraitement = signal(false);
  readonly erreurExamen = signal<string | null>(null);

  get peutTraiter(): boolean {
    return this.auth.hasPermission('traiter_anomalies');
  }

  get nombreDePages(): number {
    return Math.max(1, Math.ceil(this.total() / LIMITE_PAR_PAGE));
  }

  get pageCourante(): number {
    return Math.floor(this.skip() / LIMITE_PAR_PAGE) + 1;
  }

  ngOnInit(): void {
    this.serviceReferentiel.lister().subscribe({ next: (s) => this.services.set(s), error: () => undefined });
    this.charger();
  }

  surChangementFiltre(): void {
    this.skip.set(0);
    this.charger();
  }

  charger(): void {
    this.enChargement.set(true);
    this.erreur.set(null);

    this.anomalieService
      .lister({
        id_service: this.idServiceFiltre,
        type_anomalie: this.typeFiltre,
        statut_justification: this.statutFiltre,
        date_debut: this.dateDebut,
        date_fin: this.dateFin,
        skip: this.skip(),
        limit: LIMITE_PAR_PAGE,
      })
      .pipe(finalize(() => this.enChargement.set(false)))
      .subscribe({
        next: (page) => {
          this.anomalies.set(page.items);
          this.total.set(page.total);
        },
        error: () => this.erreur.set("Impossible de charger les anomalies. Vérifiez que l'API est démarrée."),
      });
  }

  pageSuivante(): void {
    if (this.pageCourante < this.nombreDePages) {
      this.skip.set(this.skip() + LIMITE_PAR_PAGE);
      this.charger();
    }
  }

  pagePrecedente(): void {
    if (this.pageCourante > 1) {
      this.skip.set(Math.max(0, this.skip() - LIMITE_PAR_PAGE));
      this.charger();
    }
  }

  ouvrirExamen(anomalie: AnomalieDetailOut): void {
    this.anomalieSelectionnee.set(anomalie);
    this.motif = anomalie.justificatif?.motif ?? '';
    this.pieceJointe = anomalie.justificatif?.piece_jointe_chemin ?? '';
    this.erreurExamen.set(null);
  }

  fermerExamen(): void {
    this.anomalieSelectionnee.set(null);
  }

  decider(justifiee: boolean): void {
    const anomalie = this.anomalieSelectionnee();
    if (!anomalie) return;

    if (justifiee && !this.motif.trim()) {
      this.erreurExamen.set('Le motif est obligatoire pour justifier une anomalie.');
      return;
    }

    this.enTraitement.set(true);
    this.erreurExamen.set(null);

    this.anomalieService
      .examiner(anomalie.id_anomalie, {
        anomalie_justifiee: justifiee,
        motif: this.motif.trim() || null,
        piece_jointe_chemin: this.pieceJointe.trim() || null,
      })
      .pipe(finalize(() => this.enTraitement.set(false)))
      .subscribe({
        next: () => {
          this.fermerExamen();
          this.charger();
        },
        error: () => this.erreurExamen.set("Échec de l'enregistrement de la décision. Réessayez."),
      });
  }

  initiales(anomalie: AnomalieDetailOut): string {
    const nom = anomalie.agent?.nom?.[0] ?? '';
    const prenom = anomalie.agent?.prenom?.[0] ?? '';
    return `${nom}${prenom}`.toUpperCase() || '—';
  }

  libelleType(type: TypeAnomalie): string {
    return { retard: 'Retard', absence: 'Absence', depart_anticipe: 'Départ anticipé' }[type];
  }

  libelleStatut(statut: StatutJustification): string {
    return { en_attente: 'En attente', justifiee: 'Justifiée', non_justifiee: 'Non justifiée' }[statut];
  }
}
