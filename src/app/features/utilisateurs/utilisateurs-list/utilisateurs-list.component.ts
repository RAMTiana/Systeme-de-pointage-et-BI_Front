import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, finalize, forkJoin } from 'rxjs';

import { PermissionOut, RoleOut, UtilisateurAdminOut, UtilisateurCreate, UtilisateurUpdate } from '../../../core/models/utilisateur-admin.model';
import { AuthService } from '../../../core/services/auth.service';
import { UtilisateurAdminService } from '../../../core/services/utilisateur-admin.service';
import { ReinitialiserMdpModalComponent } from '../reinitialiser-mdp-modal/reinitialiser-mdp-modal.component';
import { UtilisateurFormModalComponent } from '../utilisateur-form-modal/utilisateur-form-modal.component';

const LIMITE_PAR_PAGE = 20;

type Onglet = 'comptes' | 'roles';

@Component({
  selector: 'app-utilisateurs-list',
  standalone: true,
  imports: [CommonModule, FormsModule, UtilisateurFormModalComponent, ReinitialiserMdpModalComponent],
  templateUrl: './utilisateurs-list.component.html',
})
export class UtilisateursListComponent implements OnInit, OnDestroy {
  private readonly utilisateurAdmin = inject(UtilisateurAdminService);
  readonly authService = inject(AuthService);

  onglet: Onglet = 'comptes';

  readonly utilisateurs = signal<UtilisateurAdminOut[]>([]);
  readonly total = signal(0);
  readonly skip = signal(0);
  readonly enChargement = signal(true);
  readonly erreur = signal<string | null>(null);

  readonly roles = signal<RoleOut[]>([]);
  /** Nombre de comptes par rôle (id_role -> total), pour l'en-tête de la matrice de permissions. */
  readonly comptesParRole = signal<Record<number, number | undefined>>({});

  /** Union de toutes les permissions vues sur au moins un rôle, pour construire la matrice on/off. */
  readonly toutesPermissions = computed<PermissionOut[]>(() => {
    const parNom = new Map<string, PermissionOut>();
    for (const role of this.roles()) {
      for (const permission of role.permissions) {
        parNom.set(permission.nom_permission, permission);
      }
    }
    return [...parNom.values()];
  });

  recherche = '';
  idRoleFiltre: number | null = null;
  actifFiltre: boolean | null = null;

  readonly modaleOuverte = signal(false);
  readonly utilisateurEnEdition = signal<UtilisateurAdminOut | null>(null);
  readonly enregistrementEnCours = signal(false);
  readonly erreurModale = signal<string | null>(null);

  readonly utilisateurPourMotDePasse = signal<UtilisateurAdminOut | null>(null);
  readonly reinitialisationEnCours = signal(false);
  readonly erreurReinitialisation = signal<string | null>(null);

  private readonly rechercheSubject = new Subject<string>();

  get idUtilisateurCourant(): number | undefined {
    return this.authService.utilisateur()?.id_utilisateur;
  }

  get peutGerer(): boolean {
    return this.authService.hasPermission('valider_roles');
  }

  get nombreDePages(): number {
    return Math.max(1, Math.ceil(this.total() / LIMITE_PAR_PAGE));
  }

  get pageCourante(): number {
    return Math.floor(this.skip() / LIMITE_PAR_PAGE) + 1;
  }

  ngOnInit(): void {
    this.utilisateurAdmin.listerRoles().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.chargerComptesParRole(roles);
      },
      error: () => undefined,
    });

    this.rechercheSubject.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => {
      this.skip.set(0);
      this.charger();
    });

    this.charger();
  }

  ngOnDestroy(): void {
    this.rechercheSubject.complete();
  }

  private chargerComptesParRole(roles: RoleOut[]): void {
    if (!roles.length) return;
    forkJoin(
      roles.map((role) => this.utilisateurAdmin.lister({ id_role: role.id_role, limit: 1 }))
    ).subscribe({
      next: (pages) => {
        const compteurs: Record<number, number> = {};
        roles.forEach((role, index) => (compteurs[role.id_role] = pages[index].total));
        this.comptesParRole.set(compteurs);
      },
      error: () => undefined,
    });
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

    this.utilisateurAdmin
      .lister({
        recherche: this.recherche || undefined,
        id_role: this.idRoleFiltre,
        actif: this.actifFiltre,
        skip: this.skip(),
        limit: LIMITE_PAR_PAGE,
      })
      .pipe(finalize(() => this.enChargement.set(false)))
      .subscribe({
        next: (page) => {
          this.utilisateurs.set(page.items);
          this.total.set(page.total);
        },
        error: () => this.erreur.set("Impossible de charger la liste des comptes. Vérifiez que l'API est démarrée."),
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
    this.utilisateurEnEdition.set(null);
    this.erreurModale.set(null);
    this.modaleOuverte.set(true);
  }

  ouvrirEdition(utilisateur: UtilisateurAdminOut): void {
    this.utilisateurEnEdition.set(utilisateur);
    this.erreurModale.set(null);
    this.modaleOuverte.set(true);
  }

  fermerModale(): void {
    this.modaleOuverte.set(false);
  }

  enregistrer(payload: UtilisateurCreate | UtilisateurUpdate): void {
    const utilisateurEdite = this.utilisateurEnEdition();
    this.enregistrementEnCours.set(true);
    this.erreurModale.set(null);

    const requete = utilisateurEdite
      ? this.utilisateurAdmin.modifier(utilisateurEdite.id_utilisateur, payload)
      : this.utilisateurAdmin.creer(payload as UtilisateurCreate);

    requete.pipe(finalize(() => this.enregistrementEnCours.set(false))).subscribe({
      next: () => {
        this.modaleOuverte.set(false);
        this.charger();
        this.chargerComptesParRole(this.roles());
      },
      error: (err) =>
        this.erreurModale.set(
          err.status === 409
            ? 'Ce login ou cet e-mail est déjà utilisé par un autre compte.'
            : "Impossible d'enregistrer le compte. Vérifiez les champs saisis."
        ),
    });
  }

  changerRole(utilisateur: UtilisateurAdminOut, idRole: number): void {
    if (idRole === utilisateur.role.id_role) return;
    const role = this.roles().find((r) => r.id_role === idRole);
    if (!confirm(`Attribuer le rôle "${role?.nom_role}" à ${utilisateur.nom_complet} ?`)) {
      this.charger(); // Réaffiche le select sur la valeur d'origine.
      return;
    }

    this.utilisateurAdmin.changerRole(utilisateur.id_utilisateur, { id_role: idRole }).subscribe({
      next: () => {
        this.charger();
        this.chargerComptesParRole(this.roles());
      },
      error: () => {
        this.erreur.set('Impossible de changer le rôle de ce compte.');
        this.charger();
      },
    });
  }

  changerStatut(utilisateur: UtilisateurAdminOut): void {
    const action = utilisateur.actif ? 'désactiver' : 'réactiver';
    if (!confirm(`Confirmer : ${action} le compte de ${utilisateur.nom_complet} ?`)) return;

    const requete = utilisateur.actif
      ? this.utilisateurAdmin.desactiver(utilisateur.id_utilisateur)
      : this.utilisateurAdmin.reactiver(utilisateur.id_utilisateur);

    requete.subscribe({
      next: () => this.charger(),
      error: () => this.erreur.set('Impossible de changer le statut de ce compte.'),
    });
  }

  supprimer(utilisateur: UtilisateurAdminOut): void {
    if (!confirm(`Supprimer définitivement le compte de ${utilisateur.nom_complet} ? Cette action est irréversible.`)) {
      return;
    }
    this.utilisateurAdmin.supprimer(utilisateur.id_utilisateur).subscribe({
      next: () => {
        this.charger();
        this.chargerComptesParRole(this.roles());
      },
      error: () => this.erreur.set('Impossible de supprimer ce compte.'),
    });
  }

  ouvrirReinitialisation(utilisateur: UtilisateurAdminOut): void {
    this.utilisateurPourMotDePasse.set(utilisateur);
    this.erreurReinitialisation.set(null);
  }

  fermerReinitialisation(): void {
    this.utilisateurPourMotDePasse.set(null);
  }

  confirmerReinitialisation(nouveauMotDePasse: string): void {
    const utilisateur = this.utilisateurPourMotDePasse();
    if (!utilisateur) return;

    this.reinitialisationEnCours.set(true);
    this.erreurReinitialisation.set(null);

    this.utilisateurAdmin
      .reinitialiserMotDePasse(utilisateur.id_utilisateur, { nouveau_mot_de_passe: nouveauMotDePasse })
      .pipe(finalize(() => this.reinitialisationEnCours.set(false)))
      .subscribe({
        next: () => this.fermerReinitialisation(),
        error: () => this.erreurReinitialisation.set('Impossible de réinitialiser ce mot de passe.'),
      });
  }

  initiales(utilisateur: UtilisateurAdminOut): string {
    return (utilisateur.nom_complet.match(/\S+/g) ?? [])
      .slice(0, 2)
      .map((mot) => mot[0])
      .join('')
      .toUpperCase();
  }

  classeBadgeRole(nomRole: string): string {
    if (nomRole === 'Administrateur') return 'blue';
    if (nomRole === 'Chef de service') return 'amber';
    return 'gray';
  }

  aPermission(role: RoleOut, permission: PermissionOut): boolean {
    return role.permissions.some((p) => p.nom_permission === permission.nom_permission);
  }

  libellePermission(permission: PermissionOut): string {
    const libelles: Record<string, string> = {
      gerer_agents: 'Gérer les agents',
      gerer_services: 'Gérer les services',
      traiter_anomalies: 'Traiter les anomalies',
      generer_rapports: 'Générer les rapports',
      consulter_bi: 'Consulter le BI',
      valider_roles: 'Valider les rôles',
    };
    return libelles[permission.nom_permission] ?? permission.nom_permission.replace(/_/g, ' ');
  }
}
