import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { finalize, forkJoin } from 'rxjs';

import { BiService } from '../../core/services/bi.service';
import { ServiceReferentielService } from '../../core/services/service-referentiel.service';
import {
  ClassementAgentOut,
  ComparaisonServicesOut,
  PointTendance,
  PrevisionOut,
  TableauBordTempsReel,
} from '../../core/models/bi.model';
import { ServiceOut } from '../../core/models/service.model';

Chart.register(...registerables);

const GRIS_GRILLE = '#EEF0F2';
const PALETTE_SERVICES = ['#0F6E56', '#185FA5', '#BA7517', '#534AB7', '#D85A30', '#0F3D5C'];

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateCourte(iso: string): string {
  const [, mois, jour] = iso.split('-');
  return `${jour}/${mois}`;
}

@Component({
<<<<<<< HEAD
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
=======
    selector: 'app-dashboard',
    imports: [CommonModule, FormsModule],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss'
>>>>>>> 022816f6 (modification de la responsivité)
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvasTendance') canvasTendance!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasServices') canvasServices!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasPrevision') canvasPrevision!: ElementRef<HTMLCanvasElement>;

  readonly enChargement = signal(true);
  readonly erreur = signal<string | null>(null);

  readonly services = signal<ServiceOut[]>([]);
  readonly idServiceSelectionne = signal<number | null>(null);

  readonly tempsReel = signal<TableauBordTempsReel | null>(null);
  readonly classement = signal<ClassementAgentOut[]>([]);

  readonly aujourdHui = new Date();

  private tendances: PointTendance[] = [];
  private comparaison: ComparaisonServicesOut | null = null;
  private prevision: PrevisionOut | null = null;

  private graphiqueTendance?: Chart;
  private graphiqueServices?: Chart;
  private graphiquePrevision?: Chart;

  private vueInitialisee = false;

  constructor(
    private readonly biService: BiService,
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
  }

  surChangementService(): void {
    this.chargerTableauDeBord();
  }

  chargerTableauDeBord(): void {
    this.enChargement.set(true);
    this.erreur.set(null);

    const idService = this.idServiceSelectionne() ?? undefined;
    const auj = formatDateISO(this.aujourdHui);
    const ilY30Jours = formatDateISO(new Date(this.aujourdHui.getTime() - 29 * 24 * 60 * 60 * 1000));
    const debutDuMois = formatDateISO(new Date(this.aujourdHui.getFullYear(), this.aujourdHui.getMonth(), 1));

    forkJoin({
      tempsReel: this.biService.tempsReel(idService, auj),
      tendances: this.biService.tendances(ilY30Jours, auj, 'jour', idService),
      comparaison: this.biService.comparaisonServices('mois'),
      classement: this.biService.classement(debutDuMois, auj, 'ponctualite', 5, idService),
      prevision: this.biService.prevision('mois', idService, 6, 3),
    })
      .pipe(finalize(() => this.enChargement.set(false)))
      .subscribe({
        next: (resultats) => {
          this.tempsReel.set(resultats.tempsReel);
          this.classement.set(resultats.classement);
          this.tendances = resultats.tendances;
          this.comparaison = resultats.comparaison;
          this.prevision = resultats.prevision;
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
}
