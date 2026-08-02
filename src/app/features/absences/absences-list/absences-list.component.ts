import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { AbsenceOut, StatutAbsence } from '../../../core/models/absence.model';
import { AgentOut } from '../../../core/models/agent.model';
import { ServiceOut } from '../../../core/models/service.model';
import { AbsenceService } from '../../../core/services/absence.service';
import { AgentService } from '../../../core/services/agent.service';
import { AuthService } from '../../../core/services/auth.service';
import { ServiceReferentielService } from '../../../core/services/service-referentiel.service';

const LIMITE_PAR_PAGE = 20;

@Component({
  selector: 'app-absences-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './absences-list.component.html',
})
export class AbsencesListComponent implements OnInit {
  private readonly absenceService = inject(AbsenceService);
  private readonly agentService = inject(AgentService);
  private readonly serviceReferentiel = inject(ServiceReferentielService);
  private readonly auth = inject(AuthService);

  readonly absences = signal<AbsenceOut[]>([]);
  readonly total = signal(0);
  readonly skip = signal(0);
  readonly enChargement = signal(true);
  readonly erreur = signal<string | null>(null);
  readonly services = signal<ServiceOut[]>([]);
  readonly agents = signal<AgentOut[]>([]);

  idServiceFiltre: number | null = null;
  statutFiltre: StatutAbsence | null = 'actif';

  // --- Enregistrement ---
  readonly modaleOuverte = signal(false);
  readonly enEnvoi = signal(false);
  readonly erreurFormulaire = signal<string | null>(null);
  formulaire: { id_agent: number | null; date_debut: string; date_fin: string; motif: string } = {
    id_agent: null,
    date_debut: '',
    date_fin: '',
    motif: '',
  };

  // --- Détail / annulation ---
  readonly absenceSelectionnee = signal<AbsenceOut | null>(null);
  readonly enTraitement = signal(false);
  readonly erreurDetail = signal<string | null>(null);

  get peutGerer(): boolean {
    return this.auth.hasPermission('gerer_absences');
  }

  get nombreDePages(): number {
    return Math.max(1, Math.ceil(this.total() / LIMITE_PAR_PAGE));
  }

  get pageCourante(): number {
    return Math.floor(this.skip() / LIMITE_PAR_PAGE) + 1;
  }

  ngOnInit(): void {
    this.serviceReferentiel.lister().subscribe({ next: (s) => this.services.set(s), error: () => undefined });
    this.agentService.lister({ limit: 200 }).subscribe({ next: (p) => this.agents.set(p.items), error: () => undefined });
    this.charger();
  }

  surChangementFiltre(): void {
    this.skip.set(0);
    this.charger();
  }

  charger(): void {
    this.enChargement.set(true);
    this.erreur.set(null);

    this.absenceService
      .lister({
        id_service: this.idServiceFiltre,
        statut: this.statutFiltre,
        skip: this.skip(),
        limit: LIMITE_PAR_PAGE,
      })
      .pipe(finalize(() => this.enChargement.set(false)))
      .subscribe({
        next: (page) => {
          this.absences.set(page.items);
          this.total.set(page.total);
        },
        error: () => this.erreur.set("Impossible de charger le registre des absences. Vérifiez que l'API est démarrée."),
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

  // --- Enregistrement ---

  ouvrirFormulaire(): void {
    this.formulaire = { id_agent: null, date_debut: '', date_fin: '', motif: '' };
    this.erreurFormulaire.set(null);
    this.modaleOuverte.set(true);
  }

  fermerFormulaire(): void {
    this.modaleOuverte.set(false);
  }

  enregistrer(): void {
    const f = this.formulaire;
    if (!f.id_agent) {
      this.erreurFormulaire.set("Sélectionnez l'agent concerné.");
      return;
    }
    if (!f.date_debut || !f.date_fin) {
      this.erreurFormulaire.set('Les dates de début et de fin sont obligatoires.');
      return;
    }
    if (f.date_fin < f.date_debut) {
      this.erreurFormulaire.set('La date de fin doit être postérieure ou égale à la date de début.');
      return;
    }

    this.enEnvoi.set(true);
    this.erreurFormulaire.set(null);

    this.absenceService
      .creer({
        id_agent: f.id_agent,
        date_debut: f.date_debut,
        date_fin: f.date_fin,
        motif: f.motif.trim() || null,
      })
      .pipe(finalize(() => this.enEnvoi.set(false)))
      .subscribe({
        next: () => {
          this.fermerFormulaire();
          this.charger();
        },
        error: (err) => this.erreurFormulaire.set(err?.error?.detail ?? "Échec de l'enregistrement."),
      });
  }

  // --- Détail / annulation ---

  ouvrirDetail(absence: AbsenceOut): void {
    this.absenceSelectionnee.set(absence);
    this.erreurDetail.set(null);
  }

  fermerDetail(): void {
    this.absenceSelectionnee.set(null);
  }

  annuler(): void {
    const absence = this.absenceSelectionnee();
    if (!absence) return;

    this.enTraitement.set(true);
    this.erreurDetail.set(null);

    this.absenceService
      .annuler(absence.id_absence)
      .pipe(finalize(() => this.enTraitement.set(false)))
      .subscribe({
        next: () => {
          this.fermerDetail();
          this.charger();
        },
        error: (err) => this.erreurDetail.set(err?.error?.detail ?? "Échec de l'annulation."),
      });
  }

  initiales(absence: AbsenceOut): string {
    const nom = absence.agent?.nom?.[0] ?? '';
    const prenom = absence.agent?.prenom?.[0] ?? '';
    return `${nom}${prenom}`.toUpperCase() || '—';
  }

  libelleStatut(statut: StatutAbsence): string {
    return { actif: 'Actif', annule: 'Annulé' }[statut];
  }
}
