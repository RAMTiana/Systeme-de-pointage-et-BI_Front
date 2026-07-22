import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import {
  AssistantActionRapide,
  AssistantCapaciteOut,
  AssistantChatMessage,
} from '../../core/models/assistant-ia.model';
import { AssistantIaService } from '../../core/services/assistant-ia.service';
import { RapportService } from '../../core/services/rapport.service';

@Component({
  selector: 'app-assistant-ia',
  imports: [CommonModule, FormsModule],
  templateUrl: './assistant-ia.component.html',
  styleUrl: './assistant-ia.component.scss',
})
export class AssistantIaComponent implements OnInit {
  private readonly assistantService = inject(AssistantIaService);
  private readonly rapportService = inject(RapportService);

  @ViewChild('zoneMessages') zoneMessages?: ElementRef<HTMLDivElement>;

  readonly ouvert = signal(false);
  readonly messages = signal<AssistantChatMessage[]>([]);
  readonly capacites = signal<AssistantCapaciteOut[]>([]);
  readonly enEnvoi = signal(false);
  readonly idEnTelechargement = signal<number | null>(null);

  saisie = '';

  ngOnInit(): void {
    this.assistantService.capacites().subscribe({
      next: (capacites) => this.capacites.set(capacites),
      error: () => this.capacites.set([]),
    });
  }

  basculer(): void {
    this.ouvert.set(!this.ouvert());
    if (this.ouvert() && this.messages().length === 0) {
      this.messages.set([
        {
          auteur: 'assistant',
          texte:
            "Bonjour, je suis l'assistant du système de pointage. Je peux résumer les anomalies, " +
            "estimer une prévision de présence, générer un rapport ou répondre à une question RH. " +
            'Comment puis-je vous aider ?',
          date: new Date(),
        },
      ]);
    }
  }

  fermer(): void {
    this.ouvert.set(false);
  }

  libelleCapacite(intention: string): string {
    return this.capacites().find((c) => c.intention === intention)?.libelle ?? intention;
  }

  utiliserCapacite(capacite: AssistantCapaciteOut): void {
    this.envoyer(capacite.exemple);
  }

  utiliserAction(action: AssistantActionRapide): void {
    const capacite = this.capacites().find((c) => c.intention === action.intention);
    this.envoyer(capacite?.exemple ?? action.libelle);
  }

  envoyerSaisie(): void {
    const texte = this.saisie.trim();
    if (!texte) {
      return;
    }
    this.saisie = '';
    this.envoyer(texte);
  }

  private envoyer(texte: string): void {
    this.messages.update((liste) => [...liste, { auteur: 'utilisateur', texte, date: new Date() }]);
    this.enEnvoi.set(true);
    this.defilerVersLeBas();

    this.assistantService
      .envoyerMessage(texte)
      .pipe(finalize(() => this.enEnvoi.set(false)))
      .subscribe({
        next: (reponse) => {
          this.messages.update((liste) => [
            ...liste,
            {
              auteur: 'assistant',
              texte: reponse.reponse,
              date: new Date(),
              actionsSuggerees: reponse.actions_suggerees,
              donnees: reponse.donnees,
            },
          ]);
          this.defilerVersLeBas();
        },
        error: () => {
          this.messages.update((liste) => [
            ...liste,
            {
              auteur: 'assistant',
              texte: "Désolé, une erreur est survenue lors du traitement de votre question. Réessayez dans un instant.",
              date: new Date(),
            },
          ]);
          this.defilerVersLeBas();
        },
      });
  }

  telechargerRapport(message: AssistantChatMessage): void {
    const idRapport = message.donnees?.['id_rapport'] as number | undefined;
    const format = message.donnees?.['format'] as string | undefined;
    if (!idRapport) {
      return;
    }
    this.idEnTelechargement.set(idRapport);
    this.rapportService
      .telecharger(idRapport)
      .pipe(finalize(() => this.idEnTelechargement.set(null)))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const lien = document.createElement('a');
          lien.href = url;
          lien.download = `rapport-${idRapport}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
          lien.click();
          window.URL.revokeObjectURL(url);
        },
        error: () => {
          this.messages.update((liste) => [
            ...liste,
            {
              auteur: 'assistant',
              texte: 'Le fichier de ce rapport n’est plus disponible sur le serveur.',
              date: new Date(),
            },
          ]);
        },
      });
  }

  private defilerVersLeBas(): void {
    setTimeout(() => {
      const el = this.zoneMessages?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}
