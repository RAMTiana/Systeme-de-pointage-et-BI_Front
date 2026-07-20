import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AnalyseAnomalies,
  IaService,
  PrevisionCommentee,
  QuestionRH,
  RapportAuto,
} from './ia.service';

type Onglet = 'anomalies' | 'previsions' | 'rapport' | 'question';

@Component({
  selector: 'app-assistant-ia',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assistant-ia.component.html',
  styleUrl: './assistant-ia.component.scss',
})
export class AssistantIaComponent {
  private readonly ia = inject(IaService);

  readonly ongletActif = signal<Onglet>('anomalies');
  readonly enChargement = signal(false);
  readonly erreur = signal<string | null>(null);

  // paramètres partagés
  idService: number | null = null;
  joursAnalyse = 30;
  horizonPrevision = 3;
  periodeRapport: 'hebdomadaire' | 'mensuel' = 'hebdomadaire';
  question = '';

  readonly analyse = signal<AnalyseAnomalies | null>(null);
  readonly prevision = signal<PrevisionCommentee | null>(null);
  readonly rapport = signal<RapportAuto | null>(null);
  readonly reponse = signal<QuestionRH | null>(null);

  changerOnglet(o: Onglet): void {
    this.ongletActif.set(o);
    this.erreur.set(null);
  }

  private lancer<T>(source$: import('rxjs').Observable<T>, setter: (v: T) => void): void {
    this.enChargement.set(true);
    this.erreur.set(null);
    source$.subscribe({
      next: (v) => {
        setter(v);
        this.enChargement.set(false);
      },
      error: (err) => {
        this.erreur.set(err?.error?.detail ?? 'Erreur IA. Réessayez plus tard.');
        this.enChargement.set(false);
      },
    });
  }

  lancerAnalyse(): void {
    this.lancer(
      this.ia.analyserAnomalies({ id_service: this.idService, jours: this.joursAnalyse }),
      (v) => this.analyse.set(v),
    );
  }

  lancerPrevision(): void {
    this.lancer(
      this.ia.previsionCommentee({ id_service: this.idService, horizon: this.horizonPrevision }),
      (v) => this.prevision.set(v),
    );
  }

  lancerRapport(): void {
    this.lancer(
      this.ia.rapportAuto({ id_service: this.idService, periode: this.periodeRapport }),
      (v) => this.rapport.set(v),
    );
  }

  poserQuestion(): void {
    if (!this.question.trim()) return;
    this.lancer(
      this.ia.questionRH({ question: this.question, id_service: this.idService }),
      (v) => this.reponse.set(v),
    );
  }
}
