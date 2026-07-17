import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { RoleOut, UtilisateurAdminOut, UtilisateurCreate, UtilisateurUpdate } from '../../../core/models/utilisateur-admin.model';

@Component({
<<<<<<< HEAD
  selector: 'app-utilisateur-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './utilisateur-form-modal.component.html',
=======
    selector: 'app-utilisateur-form-modal',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './utilisateur-form-modal.component.html'
>>>>>>> 022816f6 (modification de la responsivité)
})
export class UtilisateurFormModalComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);

  /** Compte à modifier, ou `null` pour une création. */
  @Input() utilisateur: UtilisateurAdminOut | null = null;
  @Input() roles: RoleOut[] = [];
  @Input() enCours = false;
  @Input() erreur: string | null = null;

  @Output() fermer = new EventEmitter<void>();
  @Output() enregistrer = new EventEmitter<UtilisateurCreate | UtilisateurUpdate>();

  readonly formulaire = this.fb.nonNullable.group({
    login: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    nom_complet: ['', Validators.required],
    mot_de_passe: [''],
    id_role: this.fb.control<number | null>(null),
  });

  ngOnChanges(): void {
    if (this.utilisateur) {
      this.formulaire.setValue({
        login: this.utilisateur.login,
        email: this.utilisateur.email,
        nom_complet: this.utilisateur.nom_complet,
        mot_de_passe: '',
        id_role: this.utilisateur.role.id_role,
      });
      // En modification, le rôle et le mot de passe se changent via leurs actions dédiées.
      this.formulaire.controls.mot_de_passe.disable();
      this.formulaire.controls.id_role.disable();
    } else {
      this.formulaire.reset({ login: '', email: '', nom_complet: '', mot_de_passe: '', id_role: null });
      this.formulaire.controls.mot_de_passe.enable();
      this.formulaire.controls.id_role.enable();
      this.formulaire.controls.mot_de_passe.setValidators([Validators.required, Validators.minLength(8)]);
      this.formulaire.controls.id_role.setValidators(Validators.required);
    }
  }

  soumettre(): void {
    if (this.formulaire.invalid) {
      this.formulaire.markAllAsTouched();
      return;
    }
    const valeurs = this.formulaire.getRawValue();

    if (this.utilisateur) {
      this.enregistrer.emit({
        login: valeurs.login,
        email: valeurs.email,
        nom_complet: valeurs.nom_complet,
      });
    } else {
      this.enregistrer.emit({
        login: valeurs.login,
        email: valeurs.email,
        nom_complet: valeurs.nom_complet,
        mot_de_passe: valeurs.mot_de_passe,
        id_role: valeurs.id_role as number,
      });
    }
  }
}
