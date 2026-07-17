import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { FormatRapport, RapportContenu, RapportOut, TypePeriode } from '../../../core/models/rapport.model';
import { ServiceOut } from '../../../core/models/service.model';
import { AuthService } from '../../../core/services/auth.service';
import { RapportService } from '../../../core/services/rapport.service';
import { ServiceReferentielService } from '../../../core/services/service-referentiel.service';

const LIMITE_PAR_PAGE = 20;

@Component({
<<<<<<< HEAD
  selector: 'app-rapports-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rapports-list.component.html',
=======
    selector: 'app-rapports-list',
    imports: [CommonModule, FormsModule],
    templateUrl: './rapports-list.component.html'
>>>>>>> 022816f6 (modification de la responsivité)
})
export class RapportsListComponent implements OnInit {
  private readonly rapportService = inject(RapportService);
  private readonly serviceReferentiel = inject(ServiceReferentielService);
  private readonly auth = inject(AuthService);

  readonly rapports = signal<RapportOut[]>([]);
  readonly total = signal(0);
  readonly skip = signal(0);
  readonly enChargement = signal(true);
  readonly erreur = signal<string | null>(null);
  readonly services = signal<ServiceOut[]>([]);

  // Filtres de l'historique.
  typeFiltre: TypePeriode | null = null;
  formatFiltre: FormatRapport | null = null;
  idServiceFiltre: number | null = null;

  // Formulaire de génération.
  typePeriodeGeneration: TypePeriode = 'mois';
  idServiceGeneration: number | null = null;
  formatGeneration: FormatRapport = 'pdf';
  readonly enGeneration = signal(false);
  readonly erreurGeneration = signal<string | null>(null);

  readonly idEnTelechargement = signal<number | null>(null);

  readonly apercu = signal<RapportContenu | null>(null);
  readonly enChargementApercu = signal(false);

  get peutGenerer(): boolean {
    return this.auth.hasPermission('generer_rapports');
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

    this.rapportService
      .lister({
        type_periode: this.typeFiltre,
        format: this.formatFiltre,
        id_service: this.idServiceFiltre,
        skip: this.skip(),
        limit: LIMITE_PAR_PAGE,
      })
      .pipe(finalize(() => this.enChargement.set(false)))
      .subscribe({
        next: (page) => {
          this.rapports.set(page.items);
          this.total.set(page.total);
        },
        error: () => this.erreur.set("Impossible de charger l'historique des rapports. Vérifiez que l'API est démarrée."),
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

  generer(): void {
    this.enGeneration.set(true);
    this.erreurGeneration.set(null);

    this.rapportService
      .generer({
        type_periode: this.typePeriodeGeneration,
        format: this.formatGeneration,
        id_service: this.idServiceGeneration,
      })
      .pipe(finalize(() => this.enGeneration.set(false)))
      .subscribe({
        next: () => {
          this.skip.set(0);
          this.charger();
        },
        error: () => this.erreurGeneration.set('Échec de la génération du rapport. Réessayez.'),
      });
  }

  telecharger(rapport: RapportOut): void {
    this.idEnTelechargement.set(rapport.id_rapport);
    this.rapportService
      .telecharger(rapport.id_rapport)
      .pipe(finalize(() => this.idEnTelechargement.set(null)))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const lien = document.createElement('a');
          lien.href = url;
          lien.download = this.nomFichier(rapport);
          lien.click();
          window.URL.revokeObjectURL(url);
        },
        error: () => this.erreur.set('Le fichier de ce rapport n’est plus disponible sur le serveur.'),
      });
  }

  ouvrirApercu(rapport: RapportOut): void {
    this.enChargementApercu.set(true);
    this.apercu.set(null);
    this.rapportService
      .obtenirIndicateurs(rapport.id_rapport)
      .pipe(finalize(() => this.enChargementApercu.set(false)))
      .subscribe({
        next: (contenu) => this.apercu.set(contenu),
        error: () => this.erreur.set("Impossible de charger l'aperçu de ce rapport."),
      });
  }

  fermerApercu(): void {
    this.apercu.set(null);
  }

  nomFichier(rapport: RapportOut): string {
    const segments = rapport.chemin_fichier.split(/[\\/]/);
    return segments[segments.length - 1] || `rapport_${rapport.id_rapport}.${rapport.format === 'pdf' ? 'pdf' : 'xlsx'}`;
  }

  nomRapport(rapport: RapportOut): string {
    const perimetre = rapport.service ? rapport.service.nom_service : 'tous services (consolidé)';
    return `Rapport ${this.libellePeriode(rapport.type_periode).toLowerCase()} — ${perimetre}`;
  }

  sousTitre(rapport: RapportOut): string {
    if (!rapport.id_utilisateur) {
      return 'Généré automatiquement (job planifié)';
    }
    return `Généré le ${new Date(rapport.date_generation).toLocaleDateString('fr-FR')}`;
  }

  libellePeriode(type: TypePeriode): string {
    return { jour: 'Journalier', semaine: 'Hebdomadaire', mois: 'Mensuel', annee: 'Annuel' }[type];
  }
}
