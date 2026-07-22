import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { ServiceOut } from '../../../core/models/service.model';
import { ModePointage, PointageOut, StatutPointage, TypePointage } from '../../../core/models/pointage.model';
import { ServiceReferentielService } from '../../../core/services/service-referentiel.service';
import { PointageService } from '../../../core/services/pointage.service';
import { PointageScanComponent } from '../pointage-scan/pointage-scan.component';

const LIMITE_PAR_PAGE = 10;

type OngletPointage = 'historique' | 'scan';

@Component({
    selector: 'app-pointage-list',
    imports: [CommonModule, FormsModule, PointageScanComponent],
    templateUrl: './pointage-list.component.html',
    styleUrl: './pointage-list.component.scss'
})
export class PointageListComponent implements OnInit {
  private readonly pointageService = inject(PointageService);
  private readonly serviceReferentiel = inject(ServiceReferentielService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ongletActif = signal<OngletPointage>('historique');

  // Horodatage du dernier pointage détecté automatiquement (affiché dans l'historique).
  readonly derniereMiseAJour = signal<Date | null>(null);

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
  // Signaux (et non de simples propriétés) : `pointagesAffiches` est un
  // computed() qui ne se recalcule que lorsqu'un signal qu'il lit change —
  // avec de simples propriétés, taper dans la recherche ou changer le mode
  // ne rafraîchissait jamais le tableau tant qu'aucun autre signal ne bougeait.
  readonly recherche = signal('');
  readonly modeFiltre = signal<ModePointage | null>(null);

  readonly pointageSelectionne = signal<PointageOut | null>(null);

  readonly pointagesAffiches = computed(() => {
    const terme = this.recherche().trim().toLowerCase();
    const mode = this.modeFiltre();
    return this.pointages().filter((p) => {
      if (mode && p.mode_pointage !== mode) return false;
      if (!terme) return true;
      const nomComplet = `${p.agent?.prenom ?? ''} ${p.agent?.nom ?? ''} ${p.agent?.matricule ?? ''}`.toLowerCase();
      return nomComplet.includes(terme);
    });
  });

  get nombreDePages(): number {
    return Math.max(1, Math.ceil(this.total() / LIMITE_PAR_PAGE));
  }

  get pageCourante(): number {
    return Math.floor(this.skip() / LIMITE_PAR_PAGE) + 1;
  }

  ngOnInit(): void {
    this.serviceReferentiel.lister().subscribe({ next: (s) => this.services.set(s), error: () => undefined });
    this.charger();

    // Cœur de l'automatisation : dès qu'un pointage est enregistré, où que ce soit
    // (poste de scan QR / facial / WebAuthn, ou saisie manuelle ci-dessous), l'historique
    // se recharge tout seul, sans aucune action de l'utilisateur.
    this.pointageService.pointageEffectue$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.skip.set(0);
      this.charger();
      this.derniereMiseAJour.set(new Date());
    });
  }

  basculerOnglet(onglet: OngletPointage): void {
    this.ongletActif.set(onglet);
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

  initiales(pointage: PointageOut): string {
    const nom = pointage.agent?.nom?.[0] ?? '';
    const prenom = pointage.agent?.prenom?.[0] ?? '';
    return `${nom}${prenom}`.toUpperCase() || '—';
  }

  libelleMode(mode: ModePointage): string {
    return { qr: 'QR code', badge: 'Badge', facial: 'Facial', webauthn: 'Biométrie appareil' }[mode];
  }

  iconeMode(mode: ModePointage): string {
    return { qr: 'ti-qrcode', badge: 'ti-credit-card', facial: 'ti-face-id', webauthn: 'ti-fingerprint' }[mode];
  }

  libelleStatut(pointage: PointageOut): string {
    if (pointage.statut === 'rejete') return 'Rejeté';
    if (pointage.statut === 'doublon') return 'Doublon';
    return 'Validé';
  }

  libelleMotifSortie(pointage: PointageOut): string | null {
    if (!pointage.motif_sortie || pointage.motif_sortie === 'normale') return null;
    const libelles: Record<string, string> = {
      urgence: 'Urgence',
      raison_familiale: 'Cas familial',
      raison_medicale: 'Raison médicale',
      autorisation_hierarchie: 'Autorisation hiérarchie',
      autre: 'Autre',
    };
    return libelles[pointage.motif_sortie] ?? pointage.motif_sortie;
  }
}
