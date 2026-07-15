import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { ParametreOut } from '../../../core/models/parametre.model';
import { AuthService } from '../../../core/services/auth.service';
import { ParametreService } from '../../../core/services/parametre.service';

@Component({
  selector: 'app-parametres-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parametres-list.component.html',
})
export class ParametresListComponent implements OnInit {
  private readonly parametreService = inject(ParametreService);
  private readonly auth = inject(AuthService);

  readonly parametres = signal<ParametreOut[]>([]);
  readonly enChargement = signal(true);
  readonly erreur = signal<string | null>(null);

  readonly idEnEdition = signal<number | null>(null);
  valeurEnEdition = '';
  readonly enregistrementEnCours = signal(false);
  readonly erreurEdition = signal<string | null>(null);

  get peutModifier(): boolean {
    return this.auth.hasPermission('valider_roles');
  }

  ngOnInit(): void {
    this.charger();
  }

  charger(): void {
    this.enChargement.set(true);
    this.erreur.set(null);

    this.parametreService
      .lister()
      .pipe(finalize(() => this.enChargement.set(false)))
      .subscribe({
        next: (parametres) => this.parametres.set(parametres),
        error: () => this.erreur.set("Impossible de charger les paramètres. Vérifiez que l'API est démarrée."),
      });
  }

  ouvrirEdition(parametre: ParametreOut): void {
    this.idEnEdition.set(parametre.id_parametre);
    this.valeurEnEdition = parametre.valeur;
    this.erreurEdition.set(null);
  }

  annulerEdition(): void {
    this.idEnEdition.set(null);
  }

  enregistrer(parametre: ParametreOut): void {
    if (!this.valeurEnEdition.trim()) {
      this.erreurEdition.set('La valeur ne peut pas être vide.');
      return;
    }

    this.enregistrementEnCours.set(true);
    this.erreurEdition.set(null);

    this.parametreService
      .modifier(parametre.nom_parametre, { valeur: this.valeurEnEdition.trim() })
      .pipe(finalize(() => this.enregistrementEnCours.set(false)))
      .subscribe({
        next: (miseAJour) => {
          this.parametres.set(this.parametres().map((p) => (p.id_parametre === miseAJour.id_parametre ? miseAJour : p)));
          this.idEnEdition.set(null);
        },
        error: () => this.erreurEdition.set('Impossible d’enregistrer cette valeur.'),
      });
  }
}
