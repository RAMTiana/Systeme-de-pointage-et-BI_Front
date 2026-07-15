import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AgentCreate, AgentOut, AgentUpdate } from '../../../core/models/agent.model';
import { ServiceOut } from '../../../core/models/service.model';

@Component({
  selector: 'app-agent-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './agent-form-modal.component.html',
})
export class AgentFormModalComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);

  /** Agent à modifier, ou `null` pour une création. */
  @Input() agent: AgentOut | null = null;
  @Input() services: ServiceOut[] = [];
  @Input() enCours = false;
  @Input() erreur: string | null = null;

  @Output() fermer = new EventEmitter<void>();
  @Output() enregistrer = new EventEmitter<AgentCreate | AgentUpdate>();

  readonly formulaire = this.fb.nonNullable.group({
    matricule: ['', Validators.required],
    nom: ['', Validators.required],
    prenom: ['', Validators.required],
    fonction: [''],
    id_service: this.fb.control<number | null>(null),
  });

  ngOnChanges(): void {
    if (this.agent) {
      this.formulaire.setValue({
        matricule: this.agent.matricule,
        nom: this.agent.nom,
        prenom: this.agent.prenom,
        fonction: this.agent.fonction ?? '',
        id_service: this.agent.id_service ?? null,
      });
    } else {
      this.formulaire.reset({ matricule: '', nom: '', prenom: '', fonction: '', id_service: null });
    }
  }

  soumettre(): void {
    if (this.formulaire.invalid) {
      this.formulaire.markAllAsTouched();
      return;
    }
    const valeurs = this.formulaire.getRawValue();
    this.enregistrer.emit({
      matricule: valeurs.matricule,
      nom: valeurs.nom,
      prenom: valeurs.prenom,
      fonction: valeurs.fonction || null,
      id_service: valeurs.id_service,
    });
  }
}
