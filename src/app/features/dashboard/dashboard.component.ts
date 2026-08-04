import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  ViewChild,
  afterNextRender,
  computed,
  inject,
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
import {
  bornesPeriode,
  debutDeJournee,
  fenetreTendance,
  formatDateAffichage,
  formatDateCourte,
  formatDateISO,
  GRIS_GRILLE,
  HISTORIQUE_PREVISION,
  LIBELLE_FENETRE_TENDANCE,
  LIBELLE_PERIODE,
  LIBELLE_PERIODE_COURANTE,
  lundiDeSemaine,
  PALETTE_SERVICES,
} from './dashboard-format';

Chart.register(...registerables);


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
  readonly moisMaxISO = formatDateISO(new Date()).slice(0, 7);

  /** Valeur du sélecteur de mois (AAAA-MM) dérivée de la date de référence. */
  readonly moisReferenceISO = computed(() => this.dateReferenceISO().slice(0, 7));
  readonly estFiltreMensuel = computed(() => this.periode() === 'mois');

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
  private readonly injector = inject(Injector);

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

  /**
   * Sélection d'un mois entier (filtre « Mois ») : la date de référence est
   * positionnée sur le dernier jour du mois choisi — jamais dans le futur —
   * de sorte que le mois sélectionné soit analysé en entier et non arrêté au
   * jour arbitraire qu'affichait le sélecteur de date auparavant.
   */
  surChangementMois(nouveauMoisISO: string): void {
    if (!nouveauMoisISO) return;
    const [annee, mois] = nouveauMoisISO.split('-').map(Number);
    if (!annee || !mois) return;
    const aujourdHui = debutDeJournee(new Date());
    const finDuMois = new Date(annee, mois, 0);
    const reference = finDuMois > aujourdHui ? aujourdHui : finDuMois;
    this.dateReferenceISO.set(formatDateISO(reference));
    this.chargerTableauDeBord();
  }

  /**
   * Changement de granularité : en passant sur « Mois », on recale la date de
   * référence sur la fin du mois affiché (bornée à aujourd'hui) pour que les
   * indicateurs couvrent bien le mois complet dès le premier affichage.
   */
  surChangementPeriode(nouvellePeriode: TypePeriode): void {
    this.periode.set(nouvellePeriode);
    if (nouvellePeriode === 'mois') {
      this.surChangementMois(this.moisReferenceISO());
      return;
    }
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
    const { debut: debutTendance, fin: finTendance, granularite } = fenetreTendance(periode, reference);

    // Avertissement "retards consécutifs" : toujours basé sur la semaine
    // civile en cours (aujourd'hui), indépendamment de la date affichée par
    // le filtre du tableau de bord — c'est un signal d'alerte permanent.
    const aujourdHui = new Date();
    const lundiSemaineEnCours = lundiDeSemaine(aujourdHui);

    forkJoin({
      tempsReel: this.biService.tempsReel(idService, refISO),
      // Borne haute de la fenêtre de tendance : fin de la période courante
      // (bornée à la date de référence) — un mois partiel reste ainsi le
      // dernier point, sans jamais tronquer les mois précédents.
      tendances: this.biService.tendances(formatDateISO(debutTendance), formatDateISO(finTendance), granularite, idService),
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
      // Variante ML (gradient boosting) : l'historique est calibré côté
      // backend — élargi s'il est trop pauvre, tronqué s'il est trop long —
      // avec repli statistique automatique signalé par le champ `methode`.
      prevision: this.biService.previsionMl(periode, idService, HISTORIQUE_PREVISION[periode], 3, refISO),
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
          // `afterNextRender` (plutôt qu'un simple `setTimeout`) : attend que
          // Angular ait réellement terminé de ré-appliquer le template après
          // le `.set(...)` des signaux ci-dessus, avant de chercher les
          // `<canvas>` via `@ViewChild`. Nécessaire car ces `<canvas>` sont
          // sous `@if (tempsReel())` dans le template : au tout premier
          // chargement, ils n'existent pas encore dans le DOM au moment où ce
          // callback s'exécute — un appel synchrone (ou même un `setTimeout`
          // mal placé) trouvait donc des références de canvas encore
          // `undefined` et abandonnait le dessin en silence, d'où des
          // graphiques vides à l'ouverture du tableau de bord (qui ne
          // s'affichaient qu'au chargement suivant, une fois les <canvas>
          // déjà présents dans le DOM depuis le tour précédent).
          afterNextRender(() => this.dessinerGraphiquesSiPossible(), { injector: this.injector });
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
        y: {
          min: 0,
          max: 100,
          grid: { color: GRIS_GRILLE },
          ticks: { font: { size: 10.5 }, callback: (valeur) => `${valeur}%` },
        },
        x: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
      },
    };
  }

  private dessinerTendance(): void {
    if (!this.canvasTendance) return;
    this.graphiqueTendance?.destroy();

    const labels = this.tendances.map((p) => formatDateCourte(p.periode_debut, this.periode()));
    const donnees = this.tendances.map((p) => (p.globaux.taux_presence ?? 0) * 100);

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
            data: services.map((s) => (s.taux_presence ?? 0) * 100),
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
      ...historique.map((p) => formatDateCourte(p.periode_debut, this.periode())),
      ...previsionPoints.map((p) => formatDateCourte(p.periode_debut, this.periode()) + '*'),
    ];

    const donneesHistorique: (number | null)[] = historique.map((p) => (p.globaux.taux_presence ?? 0) * 100);
    const donneesPrevision: (number | null)[] = [
      ...new Array(Math.max(historique.length - 1, 0)).fill(null),
      ...(historique.length ? [donneesHistorique[donneesHistorique.length - 1]] : []),
      ...previsionPoints.map((p) => (p.taux_presence_estime !== null ? p.taux_presence_estime * 100 : null)),
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

    const labels = this.tendances.map((p) => formatDateCourte(p.periode_debut, this.periode()));
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
