import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { finalize, forkJoin, map } from 'rxjs';

import { AnomalieService } from '../../core/services/anomalie.service';
import { BiService } from '../../core/services/bi.service';
import { ServiceReferentielService } from '../../core/services/service-referentiel.service';
import {
  AnomalieAgentScoreOut,
  ClassementAgentOut,
  ComparaisonServicesOut,
  PointTendance,
  PrevisionOut,
  ScoreRisqueAgentOut,
  TableauBordTempsReel,
  TypePeriode,
} from '../../core/models/bi.model';
import { ServiceOut } from '../../core/models/service.model';
import { calculerRecommandations, Recommandation } from './decision-support';

Chart.register(...registerables);

const GRIS_GRILLE = '#EEF0F2';
const PALETTE_SERVICES = ['#0F6E56', '#185FA5', '#BA7517', '#534AB7', '#D85A30', '#0F3D5C'];

const LIBELLE_PERIODE: Record<TypePeriode, string> = {
  jour: 'Jour',
  semaine: 'Semaine',
  mois: 'Mois',
  annee: 'Année',
};

const LIBELLE_FENETRE_TENDANCE: Record<TypePeriode, string> = {
  jour: '30 derniers jours',
  semaine: '12 dernières semaines',
  mois: '12 derniers mois',
  annee: '5 dernières années',
};

const LIBELLE_PERIODE_COURANTE: Record<TypePeriode, string> = {
  jour: 'ce jour',
  semaine: 'cette semaine',
  mois: 'ce mois-ci',
  annee: 'cette année',
};

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateCourte(iso: string): string {
  const [, mois, jour] = iso.split('-');
  return `${jour}/${mois}`;
}

function formatDateAffichage(iso: string): string {
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
}

function debutDeJournee(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function lundiDeSemaine(date: Date): Date {
  const d = debutDeJournee(date);
  const decalage = (d.getDay() + 6) % 7; // 0 = lundi ... 6 = dimanche
  d.setDate(d.getDate() - decalage);
  return d;
}

/** Bornes de la période sélectionnée — même convention que `bornes_periode` côté backend. */
function bornesPeriode(periode: TypePeriode, reference: Date): { debut: Date; fin: Date } {
  const ref = debutDeJournee(reference);
  switch (periode) {
    case 'jour':
      return { debut: ref, fin: ref };
    case 'semaine': {
      const debut = lundiDeSemaine(ref);
      const fin = new Date(debut);
      fin.setDate(fin.getDate() + 6);
      return { debut, fin };
    }
    case 'mois': {
      const debut = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      return { debut, fin };
    }
    case 'annee':
    default: {
      const debut = new Date(ref.getFullYear(), 0, 1);
      const fin = new Date(ref.getFullYear(), 11, 31);
      return { debut, fin };
    }
  }
}

/** Fenêtre glissante affichée sur les graphiques de tendance/prévision, avec la granularité assortie. */
function fenetreTendance(periode: TypePeriode, reference: Date): { debut: Date; fin: Date; granularite: TypePeriode } {
  const fin = debutDeJournee(reference);
  const debut = new Date(fin);
  switch (periode) {
    case 'jour':
      debut.setDate(debut.getDate() - 29);
      break;
    case 'semaine':
      debut.setDate(debut.getDate() - 7 * 11);
      break;
    case 'mois':
      debut.setMonth(debut.getMonth() - 11);
      break;
    case 'annee':
    default:
      debut.setFullYear(debut.getFullYear() - 4);
      break;
  }
  return { debut, fin, granularite: periode };
}

@Component({
    selector: 'app-dashboard',
    imports: [CommonModule, FormsModule],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvasTendance') canvasTendance!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasServices') canvasServices!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasPrevision') canvasPrevision!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasAbsencesRetards') canvasAbsencesRetards!: ElementRef<HTMLCanvasElement>;

  readonly enChargement = signal(true);
  readonly erreur = signal<string | null>(null);

  readonly services = signal<ServiceOut[]>([]);
  readonly idServiceSelectionne = signal<number | null>(null);

  readonly periodes: TypePeriode[] = ['jour', 'semaine', 'mois', 'annee'];
  readonly periode = signal<TypePeriode>('mois');
  readonly dateReferenceISO = signal(formatDateISO(new Date()));
  readonly dateMaxISO = formatDateISO(new Date());

  readonly libellePeriode = computed(() => LIBELLE_PERIODE[this.periode()]);
  readonly libelleFenetreTendance = computed(() => LIBELLE_FENETRE_TENDANCE[this.periode()]);
  readonly libellePeriodeCourante = computed(() => LIBELLE_PERIODE_COURANTE[this.periode()]);
  readonly estAujourdHui = computed(() => this.dateReferenceISO() === this.dateMaxISO);
  readonly libelleJourSnapshot = computed(() =>
    this.estAujourdHui() ? "aujourd'hui" : `le ${formatDateAffichage(this.dateReferenceISO())}`
  );

  readonly tempsReel = signal<TableauBordTempsReel | null>(null);
  readonly classement = signal<ClassementAgentOut[]>([]);
  readonly classementAbsences = signal<ClassementAgentOut[]>([]);
  readonly recommandations = signal<Recommandation[]>([]);
  readonly anomaliesMl = signal<AnomalieAgentScoreOut[]>([]);
  readonly scoreRisque = signal<ScoreRisqueAgentOut[]>([]);

  private tendances: PointTendance[] = [];
  private comparaison: ComparaisonServicesOut | null = null;
  private prevision: PrevisionOut | null = null;

  private graphiqueTendance?: Chart;
  private graphiqueServices?: Chart;
  private graphiquePrevision?: Chart;
  private graphiqueAbsencesRetards?: Chart;

  private vueInitialisee = false;

  constructor(
    private readonly biService: BiService,
    private readonly anomalieService: AnomalieService,
    private readonly serviceReferentiel: ServiceReferentielService
  ) {}

  ngOnInit(): void {
    this.serviceReferentiel.lister().subscribe({
      next: (services) => this.services.set(services),
      error: () => undefined, // le filtre reste simplement vide si l'appel échoue
    });
    this.chargerTableauDeBord();
  }

  ngAfterViewInit(): void {
    this.vueInitialisee = true;
    this.dessinerGraphiquesSiPossible();
  }

  ngOnDestroy(): void {
    this.graphiqueTendance?.destroy();
    this.graphiqueServices?.destroy();
    this.graphiquePrevision?.destroy();
    this.graphiqueAbsencesRetards?.destroy();
  }

  surChangementFiltre(): void {
    this.chargerTableauDeBord();
  }

  surChangementDate(nouvelleDateISO: string): void {
    if (!nouvelleDateISO) return;
    // Une date future n'a pas de sens pour un tableau de bord de présence constatée.
    this.dateReferenceISO.set(nouvelleDateISO > this.dateMaxISO ? this.dateMaxISO : nouvelleDateISO);
    this.chargerTableauDeBord();
  }

  allerAujourdHui(): void {
    if (this.estAujourdHui()) return;
    this.dateReferenceISO.set(this.dateMaxISO);
    this.chargerTableauDeBord();
  }

  chargerTableauDeBord(): void {
    this.enChargement.set(true);
    this.erreur.set(null);

    const idService = this.idServiceSelectionne() ?? undefined;
    const periode = this.periode();
    const refISO = this.dateReferenceISO();
    const reference = new Date(`${refISO}T00:00:00`);

    const { debut: debutPeriode, fin: finPeriode } = bornesPeriode(periode, reference);
    const { debut: debutTendance, granularite } = fenetreTendance(periode, reference);

    // Avertissement "retards consécutifs" : toujours basé sur la semaine
    // civile en cours (aujourd'hui), indépendamment de la date affichée par
    // le filtre du tableau de bord — c'est un signal d'alerte permanent.
    const aujourdHui = new Date();
    const lundiSemaineEnCours = lundiDeSemaine(aujourdHui);

    forkJoin({
      tempsReel: this.biService.tempsReel(idService, refISO),
      tendances: this.biService.tendances(formatDateISO(debutTendance), refISO, granularite, idService),
      comparaison: this.biService.comparaisonServices(periode, refISO),
      classement: this.biService.classement(
        formatDateISO(debutPeriode),
        formatDateISO(finPeriode),
        'ponctualite',
        5,
        idService
      ),
      classementAbsences: this.biService.classement(
        formatDateISO(debutPeriode),
        formatDateISO(finPeriode),
        'absences',
        5,
        idService
      ),
      prevision: this.biService.prevision(periode, idService, 6, 3, refISO),
      anomaliesMl: this.biService.anomaliesMl(periode, idService, refISO),
      scoreRisque: this.biService.scoreRisque(idService, 7, refISO),
      anomaliesRetardSemaine: this.anomalieService
        .lister({
          type_anomalie: 'retard',
          id_service: idService,
          date_debut: formatDateISO(lundiSemaineEnCours),
          date_fin: formatDateISO(aujourdHui),
          limit: 200,
        })
        .pipe(map((page) => page.items)),
      anomaliesAbsenceSemaine: this.anomalieService
        .lister({
          type_anomalie: 'absence',
          id_service: idService,
          date_debut: formatDateISO(lundiSemaineEnCours),
          date_fin: formatDateISO(aujourdHui),
          limit: 200,
        })
        .pipe(map((page) => page.items)),
    })
      .pipe(finalize(() => this.enChargement.set(false)))
      .subscribe({
        next: (resultats) => {
          this.tempsReel.set(resultats.tempsReel);
          this.classement.set(resultats.classement);
          this.classementAbsences.set(resultats.classementAbsences);
          this.tendances = resultats.tendances;
          this.comparaison = resultats.comparaison;
          this.prevision = resultats.prevision;
          this.anomaliesMl.set(resultats.anomaliesMl);
          this.scoreRisque.set(resultats.scoreRisque);
          this.recommandations.set(
            calculerRecommandations({
              tempsReel: resultats.tempsReel,
              tendances: resultats.tendances,
              comparaison: resultats.comparaison,
              classement: resultats.classement,
              prevision: resultats.prevision,
              anomaliesMl: resultats.anomaliesMl,
              scoresRisque: resultats.scoreRisque,
              anomaliesRetardSemaine: resultats.anomaliesRetardSemaine,
              anomaliesAbsenceSemaine: resultats.anomaliesAbsenceSemaine,
            })
          );
          this.dessinerGraphiquesSiPossible();
        },
        error: () =>
          this.erreur.set(
            "Impossible de charger le tableau de bord. Vérifiez que l'API est démarrée (voir README du backend)."
          ),
      });
  }

  private dessinerGraphiquesSiPossible(): void {
    if (!this.vueInitialisee) {
      return;
    }
    this.dessinerTendance();
    this.dessinerComparaisonServices();
    this.dessinerPrevision();
    this.dessinerAbsencesRetards();
  }

  private optionsAxes(): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100, grid: { color: GRIS_GRILLE }, ticks: { font: { size: 10.5 } } },
        x: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
      },
    };
  }

  private dessinerTendance(): void {
    if (!this.canvasTendance) return;
    this.graphiqueTendance?.destroy();

    const labels = this.tendances.map((p) => formatDateCourte(p.periode_debut));
    const donnees = this.tendances.map((p) => p.globaux.taux_presence ?? 0);

    this.graphiqueTendance = new Chart(this.canvasTendance.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: donnees,
            borderColor: '#0F6E56',
            backgroundColor: 'rgba(15,110,86,0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: this.optionsAxes(),
    });
  }

  private dessinerComparaisonServices(): void {
    if (!this.canvasServices || !this.comparaison) return;
    this.graphiqueServices?.destroy();

    const services = this.comparaison.services;
    this.graphiqueServices = new Chart(this.canvasServices.nativeElement, {
      type: 'bar',
      data: {
        labels: services.map((s) => s.nom_service),
        datasets: [
          {
            data: services.map((s) => s.taux_presence ?? 0),
            backgroundColor: services.map((_, i) => PALETTE_SERVICES[i % PALETTE_SERVICES.length]),
            borderRadius: 5,
            maxBarThickness: 38,
          },
        ],
      },
      options: this.optionsAxes(),
    });
  }

  private dessinerPrevision(): void {
    if (!this.canvasPrevision || !this.prevision) return;
    this.graphiquePrevision?.destroy();

    const historique = this.prevision.historique;
    const previsionPoints = this.prevision.prevision;
    const labels = [
      ...historique.map((p) => formatDateCourte(p.periode_debut)),
      ...previsionPoints.map((p) => formatDateCourte(p.periode_debut) + '*'),
    ];

    const donneesHistorique: (number | null)[] = historique.map((p) => p.globaux.taux_presence ?? 0);
    const donneesPrevision: (number | null)[] = [
      ...new Array(Math.max(historique.length - 1, 0)).fill(null),
      ...(historique.length ? [donneesHistorique[donneesHistorique.length - 1]] : []),
      ...previsionPoints.map((p) => p.taux_presence_estime ?? null),
    ];
    const donneesHistoriquePadding: (number | null)[] = [
      ...donneesHistorique,
      ...new Array(previsionPoints.length).fill(null),
    ];

    this.graphiquePrevision = new Chart(this.canvasPrevision.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { data: donneesHistoriquePadding, borderColor: '#185FA5', pointRadius: 3, borderWidth: 2, tension: 0.3 },
          {
            data: donneesPrevision,
            borderColor: '#185FA5',
            borderDash: [5, 4],
            pointRadius: 3,
            borderWidth: 2,
            tension: 0.3,
          },
        ],
      },
      options: this.optionsAxes(),
    });
  }

  /**
   * Évolution comparée des taux d'absence et de retard sur la même fenêtre
   * que le graphique de tendance de présence (`this.tendances`) : chaque
   * point de tendance porte déjà `globaux.nombre_absences` /
   * `globaux.nombre_retards` / `globaux.jours_ouvres`, d'où sont dérivés ici
   * les deux taux (jours-agent d'absence ou de retard rapportés aux
   * jours-agent ouvrés de la période), sans appel API supplémentaire.
   */
  private dessinerAbsencesRetards(): void {
    if (!this.canvasAbsencesRetards) return;
    this.graphiqueAbsencesRetards?.destroy();

    const labels = this.tendances.map((p) => formatDateCourte(p.periode_debut));
    const tauxAbsence = this.tendances.map((p) =>
      p.globaux.jours_ouvres > 0 ? Math.round((p.globaux.nombre_absences / p.globaux.jours_ouvres) * 1000) / 10 : 0
    );
    const tauxRetard = this.tendances.map((p) =>
      p.globaux.jours_ouvres > 0 ? Math.round((p.globaux.nombre_retards / p.globaux.jours_ouvres) * 1000) / 10 : 0
    );

    this.graphiqueAbsencesRetards = new Chart(this.canvasAbsencesRetards.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Absences',
            data: tauxAbsence,
            borderColor: '#D85A30',
            backgroundColor: 'rgba(216,90,48,0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: 'Retards',
            data: tauxRetard,
            borderColor: '#BA7517',
            backgroundColor: 'rgba(186,117,23,0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 10.5 } } } },
        scales: {
          y: {
            min: 0,
            grid: { color: GRIS_GRILLE },
            ticks: { font: { size: 10.5 }, callback: (valeur) => `${valeur}%` },
          },
          x: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
        },
      },
    });
  }
}
