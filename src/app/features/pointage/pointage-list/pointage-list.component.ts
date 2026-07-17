import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { ServiceOut } from '../../../core/models/service.model';
import { ModePointage, PointageOut, StatutPointage, TypePointage } from '../../../core/models/pointage.model';
import { ServiceReferentielService } from '../../../core/services/service-referentiel.service';
import { PointageService } from '../../../core/services/pointage.service';

const LIMITE_PAR_PAGE = 20;

@Component({
    selector: 'app-pointage-list',
    imports: [CommonModule, FormsModule],
    templateUrl: './pointage-list.component.html'
})
export class PointageListComponent implements OnInit {
  private readonly pointageService = inject(PointageService);
  private readonly serviceReferentiel = inject(ServiceReferentielService);

  readonly pointages = signal<PointageOut[]>([]);
  readonly total = signal(0);
  readonly skip = signal(0);
  readonly enChargement = signal(true);
  readonly erreur = signal<string | null>(null);

  readonly services = signal<ServiceOut[]>([]);

  // Filtres appliqués côté serveur.
  idServiceFiltre: number | null = null;
  typeFiltre: TypePointage | null = null;
  statutFiltre: StatutPointage | null = null;
  dateDebut: string | null = null;
  dateFin: string | null = null;

  // Filtres appliqués côté client sur la page courante (non supportés par l'API).
  recherche = '';
  modeFiltre: ModePointage | null = null;

  readonly pointageSelectionne = signal<PointageOut | null>(null);

  readonly pointagesAffiches = computed(() => {
    const terme = this.recherche.trim().toLowerCase();
    const mode = this.modeFiltre;
    return this.pointages().filter((p) => {
      if (mode && p.mode_pointage !== mode) return false;
      if (!terme) return true;
      const nomComplet = `${p.agent?.prenom ?? ''} ${p.agent?.nom ?? ''} ${p.agent?.matricule ?? ''}`.toLowerCase();
      return nomComplet.includes(terme);
    });
  });

  matriculeSaisie = '';
  typePointageSaisie: TypePointage = 'entree';
  modeSaisie: 'qr' | 'badge' | 'facial' = 'qr';
  deviceKeySaisie = 'change-me-device-key';
  readonly soumissionEnCours = signal(false);
  readonly messagePointage = signal<string | null>(null);

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

  surChangementFiltreServeur(): void {
    this.skip.set(0);
    this.charger();
  }

  charger(): void {
    this.enChargement.set(true);
    this.erreur.set(null);

    this.pointageService
      .lister({
        id_service: this.idServiceFiltre,
        type_pointage: this.typeFiltre,
        statut: this.statutFiltre,
        date_debut: this.dateDebut,
        date_fin: this.dateFin,
        skip: this.skip(),
        limit: LIMITE_PAR_PAGE,
      })
      .pipe(finalize(() => this.enChargement.set(false)))
      .subscribe({
        next: (page) => {
          this.pointages.set(page.items);
          this.total.set(page.total);
        },
        error: () =>
          this.erreur.set("Impossible de charger l'historique des pointages. Vérifiez que l'API est démarrée."),
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

  ouvrirDetail(pointage: PointageOut): void {
    this.pointageSelectionne.set(pointage);
  }

  fermerDetail(): void {
    this.pointageSelectionne.set(null);
  }

  pointer(): void {
    const matricule = this.matriculeSaisie.trim();
    if (!matricule) {
      this.messagePointage.set('Le matricule est requis.');
      return;
    }

    this.soumissionEnCours.set(true);
    this.messagePointage.set(null);

    this.pointageService
      .pointer(this.modeSaisie, { matricule, type_pointage: this.typePointageSaisie }, this.deviceKeySaisie)
      .pipe(finalize(() => this.soumissionEnCours.set(false)))
      .subscribe({
        next: () => {
          this.messagePointage.set(`Pointage ${this.typePointageSaisie === 'entree' ? 'd’entrée' : 'de sortie'} enregistré.`);
          this.matriculeSaisie = '';
          this.charger();
        },
        error: (error) => {
          const detail = error?.error?.detail ?? 'Le pointage n’a pas pu être enregistré.';
          this.messagePointage.set(detail);
        },
      });
  }

  initiales(pointage: PointageOut): string {
    const nom = pointage.agent?.nom?.[0] ?? '';
    const prenom = pointage.agent?.prenom?.[0] ?? '';
    return `${nom}${prenom}`.toUpperCase() || '—';
  }

  libelleMode(mode: ModePointage): string {
    return { qr: 'QR code', badge: 'Badge', facial: 'Facial' }[mode];
  }

  iconeMode(mode: ModePointage): string {
    return { qr: 'ti-qrcode', badge: 'ti-credit-card', facial: 'ti-face-id' }[mode];
  }

  libelleStatut(pointage: PointageOut): string {
    if (pointage.statut === 'rejete') return 'Rejeté';
    if (pointage.statut === 'doublon') return 'Doublon';
    return 'Validé';
  }
}
