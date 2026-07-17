import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ServiceOut } from '../../../core/models/service.model';
import { ServicePayload } from '../../../core/services/service-referentiel.service';

@Component({
<<<<<<< HEAD
  selector: 'app-service-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './service-form-modal.component.html',
=======
    selector: 'app-service-form-modal',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './service-form-modal.component.html'
>>>>>>> 022816f6 (modification de la responsivité)
})
export class ServiceFormModalComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);

  /** Service à modifier, ou `null` pour une création. */
  @Input() service: ServiceOut | null = null;
  @Input() enCours = false;
  @Input() erreur: string | null = null;

  @Output() fermer = new EventEmitter<void>();
  @Output() enregistrer = new EventEmitter<ServicePayload>();

  readonly formulaire = this.fb.nonNullable.group({
    nom_service: ['', Validators.required],
    description: [''],
  });

  ngOnChanges(): void {
    if (this.service) {
      this.formulaire.setValue({
        nom_service: this.service.nom_service,
        description: this.service.description ?? '',
      });
    } else {
      this.formulaire.reset({ nom_service: '', description: '' });
    }
  }

  soumettre(): void {
    if (this.formulaire.invalid) {
      this.formulaire.markAllAsTouched();
      return;
    }
    const valeurs = this.formulaire.getRawValue();
    this.enregistrer.emit({
      nom_service: valeurs.nom_service,
      description: valeurs.description || null,
    });
  }
}
