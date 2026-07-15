import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { UtilisateurAdminOut } from '../../../core/models/utilisateur-admin.model';

@Component({
  selector: 'app-reinitialiser-mdp-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reinitialiser-mdp-modal.component.html',
})
export class ReinitialiserMdpModalComponent {
  @Input({ required: true }) utilisateur!: UtilisateurAdminOut;
  @Input() enCours = false;
  @Input() erreur: string | null = null;

  @Output() fermer = new EventEmitter<void>();
  @Output() confirmer = new EventEmitter<string>();

  nouveauMotDePasse = '';
  confirmation = '';

  get erreurLocale(): string | null {
    if (this.nouveauMotDePasse && this.nouveauMotDePasse.length < 8) {
      return '8 caractères minimum.';
    }
    if (this.confirmation && this.confirmation !== this.nouveauMotDePasse) {
      return 'Les deux mots de passe ne correspondent pas.';
    }
    return null;
  }

  soumettre(): void {
    if (this.nouveauMotDePasse.length < 8 || this.nouveauMotDePasse !== this.confirmation) return;
    this.confirmer.emit(this.nouveauMotDePasse);
  }
}
