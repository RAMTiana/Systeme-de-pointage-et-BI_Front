import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { AgentCreate, AgentOut, AgentUpdate, StatutAgent } from '../../../core/models/agent.model';
import { ServiceOut } from '../../../core/models/service.model';
import { AgentService } from '../../../core/services/agent.service';
import { AuthService } from '../../../core/services/auth.service';
import { ServiceReferentielService } from '../../../core/services/service-referentiel.service';
import { AgentFormModalComponent } from '../agent-form-modal/agent-form-modal.component';

const LIMITE_PAR_PAGE = 20;

@Component({
<<<<<<< HEAD
  selector: 'app-agents-list',
  standalone: true,
  imports: [CommonModule, FormsModule, AgentFormModalComponent],
  templateUrl: './agents-list.component.html',
=======
    selector: 'app-agents-list',
    imports: [CommonModule, FormsModule, AgentFormModalComponent],
    templateUrl: './agents-list.component.html'
>>>>>>> 022816f6 (modification de la responsivité)
})
export class AgentsListComponent implements OnInit, OnDestroy {
  private readonly agentService = inject(AgentService);
  private readonly serviceReferentiel = inject(ServiceReferentielService);
  readonly authService = inject(AuthService);

  readonly agents = signal<AgentOut[]>([]);
  readonly total = signal(0);
  readonly skip = signal(0);
  readonly enChargement = signal(true);
  readonly erreur = signal<string | null>(null);

  readonly services = signal<ServiceOut[]>([]);

  recherche = '';
  idServiceFiltre: number | null = null;
  statutFiltre: StatutAgent | null = null;

  readonly modaleOuverte = signal(false);
  readonly agentEnEdition = signal<AgentOut | null>(null);
  readonly enregistrementEnCours = signal(false);
  readonly erreurModale = signal<string | null>(null);

  private readonly rechercheSubject = new Subject<string>();

  get peutGerer(): boolean {
    return this.authService.hasPermission('gerer_agents');
  }

  get nombreDePages(): number {
    return Math.max(1, Math.ceil(this.total() / LIMITE_PAR_PAGE));
  }

  get pageCourante(): number {
    return Math.floor(this.skip() / LIMITE_PAR_PAGE) + 1;
  }

  ngOnInit(): void {
    this.serviceReferentiel.lister().subscribe({ next: (s) => this.services.set(s), error: () => undefined });

    this.rechercheSubject.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => {
      this.skip.set(0);
      this.charger();
    });

    this.charger();
  }

  ngOnDestroy(): void {
    this.rechercheSubject.complete();
  }

  surSaisieRecherche(): void {
    this.rechercheSubject.next(this.recherche);
  }

  surChangementFiltre(): void {
    this.skip.set(0);
    this.charger();
  }

  charger(): void {
    this.enChargement.set(true);
    this.erreur.set(null);

    this.agentService
      .lister({
        recherche: this.recherche || undefined,
        id_service: this.idServiceFiltre,
        statut: this.statutFiltre,
        skip: this.skip(),
        limit: LIMITE_PAR_PAGE,
      })
      .pipe(finalize(() => this.enChargement.set(false)))
      .subscribe({
        next: (page) => {
          this.agents.set(page.items);
          this.total.set(page.total);
        },
        error: () =>
          this.erreur.set("Impossible de charger la liste des agents. Vérifiez que l'API est démarrée."),
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

  ouvrirCreation(): void {
    this.agentEnEdition.set(null);
    this.erreurModale.set(null);
    this.modaleOuverte.set(true);
  }

  ouvrirEdition(agent: AgentOut): void {
    this.agentEnEdition.set(agent);
    this.erreurModale.set(null);
    this.modaleOuverte.set(true);
  }

  fermerModale(): void {
    this.modaleOuverte.set(false);
  }

  enregistrerAgent(payload: AgentCreate | AgentUpdate): void {
    const agentEdite = this.agentEnEdition();
    this.enregistrementEnCours.set(true);
    this.erreurModale.set(null);

    const requete = agentEdite
      ? this.agentService.modifier(agentEdite.id_agent, payload)
      : this.agentService.creer(payload as AgentCreate);

    requete.pipe(finalize(() => this.enregistrementEnCours.set(false))).subscribe({
      next: () => {
        this.modaleOuverte.set(false);
        this.charger();
      },
      error: (err) =>
        this.erreurModale.set(
          err.status === 409
            ? 'Ce matricule est déjà utilisé par un autre agent.'
            : "Impossible d'enregistrer l'agent. Vérifiez les champs saisis."
        ),
    });
  }

  changerStatut(agent: AgentOut): void {
    const action = agent.statut === 'actif' ? 'désactiver' : 'réactiver';
    if (!confirm(`Confirmer : ${action} ${agent.prenom} ${agent.nom} ?`)) return;

    const requete = agent.statut === 'actif' ? this.agentService.desactiver(agent.id_agent) : this.agentService.reactiver(agent.id_agent);
    requete.subscribe({
      next: (miseAJour) => this.remplacerAgent(miseAJour),
      error: () => this.erreur.set('Impossible de changer le statut de cet agent.'),
    });
  }

  changerConsentementFacial(agent: AgentOut): void {
    const nouvelleValeur = !agent.consentement_facial;
    const message = nouvelleValeur
      ? `Confirmer le consentement de ${agent.prenom} ${agent.nom} à la reconnaissance faciale ?`
      : `Retirer le consentement facial de ${agent.prenom} ${agent.nom} ?`;
    if (!confirm(message)) return;

    this.agentService.definirConsentementFacial(agent.id_agent, nouvelleValeur).subscribe({
      next: (miseAJour) => this.remplacerAgent(miseAJour),
      error: () => this.erreur.set('Impossible de modifier le consentement facial.'),
    });
  }

  supprimerAgent(agent: AgentOut): void {
    if (!confirm(`Supprimer définitivement ${agent.prenom} ${agent.nom} (${agent.matricule}) ? Cette action est irréversible.`)) {
      return;
    }
    this.agentService.supprimer(agent.id_agent).subscribe({
      next: () => this.charger(),
      error: () => this.erreur.set('Suppression impossible (des données liées existent peut-être encore).'),
    });
  }

  initiales(agent: AgentOut): string {
    return `${agent.nom[0] ?? ''}${agent.prenom[0] ?? ''}`.toUpperCase();
  }

  private remplacerAgent(agentMisAJour: AgentOut): void {
    this.agents.update((liste) => liste.map((a) => (a.id_agent === agentMisAJour.id_agent ? agentMisAJour : a)));
  }
}
