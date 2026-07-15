import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { ServiceOut } from '../../../core/models/service.model';
import { AuthService } from '../../../core/services/auth.service';
import { ServicePayload, ServiceReferentielService } from '../../../core/services/service-referentiel.service';
import { ServiceFormModalComponent } from '../service-form-modal/service-form-modal.component';

@Component({
  selector: 'app-services-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ServiceFormModalComponent],
  templateUrl: './services-list.component.html',
})
export class ServicesListComponent implements OnInit, OnDestroy {
  private readonly serviceReferentiel = inject(ServiceReferentielService);
  readonly authService = inject(AuthService);

  readonly services = signal<ServiceOut[]>([]);
  readonly enChargement = signal(true);
  readonly erreur = signal<string | null>(null);

  recherche = '';

  readonly modaleOuverte = signal(false);
  readonly serviceEnEdition = signal<ServiceOut | null>(null);
  readonly enregistrementEnCours = signal(false);
  readonly erreurModale = signal<string | null>(null);

  private readonly rechercheSubject = new Subject<string>();

  get peutGerer(): boolean {
    return this.authService.hasPermission('gerer_services');
  }

  ngOnInit(): void {
    this.rechercheSubject.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.charger());
    this.charger();
  }

  ngOnDestroy(): void {
    this.rechercheSubject.complete();
  }

  surSaisieRecherche(): void {
    this.rechercheSubject.next(this.recherche);
  }

  charger(): void {
    this.enChargement.set(true);
    this.erreur.set(null);

    this.serviceReferentiel
      .lister(this.recherche || undefined)
      .pipe(finalize(() => this.enChargement.set(false)))
      .subscribe({
        next: (services) => this.services.set(services),
        error: () => this.erreur.set("Impossible de charger la liste des services. Vérifiez que l'API est démarrée."),
      });
  }

  ouvrirCreation(): void {
    this.serviceEnEdition.set(null);
    this.erreurModale.set(null);
    this.modaleOuverte.set(true);
  }

  ouvrirEdition(service: ServiceOut): void {
    this.serviceEnEdition.set(service);
    this.erreurModale.set(null);
    this.modaleOuverte.set(true);
  }

  fermerModale(): void {
    this.modaleOuverte.set(false);
  }

  enregistrerService(payload: ServicePayload): void {
    const serviceEdite = this.serviceEnEdition();
    this.enregistrementEnCours.set(true);
    this.erreurModale.set(null);

    const requete = serviceEdite
      ? this.serviceReferentiel.modifier(serviceEdite.id_service, payload)
      : this.serviceReferentiel.creer(payload);

    requete.pipe(finalize(() => this.enregistrementEnCours.set(false))).subscribe({
      next: () => {
        this.modaleOuverte.set(false);
        this.charger();
      },
      error: (err) =>
        this.erreurModale.set(
          err.status === 409
            ? 'Un service porte déjà ce nom.'
            : "Impossible d'enregistrer le service. Vérifiez les champs saisis."
        ),
    });
  }

  supprimerService(service: ServiceOut): void {
    const avertissement =
      service.nombre_agents > 0
        ? ` ${service.nombre_agents} agent(s) actuellement rattaché(s) seront détachés (service principal remis à vide).`
        : '';
    if (!confirm(`Supprimer le service « ${service.nom_service} » ?${avertissement}`)) return;

    this.serviceReferentiel.supprimer(service.id_service).subscribe({
      next: () => this.charger(),
      error: () => this.erreur.set('Suppression impossible pour ce service.'),
    });
  }
}
