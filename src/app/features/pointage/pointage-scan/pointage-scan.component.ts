import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import type { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';

import { environment } from '../../../../environments/environment';
import { PointageService } from '../../../core/services/pointage.service';
import { MotifSortie, TypePointage } from '../../../core/models/pointage.model';

// BarcodeDetector n'est pas typé par défaut dans TS.
declare const BarcodeDetector: any;

type Mode = 'qr' | 'facial' | 'webauthn';

/** Motifs proposés au poste de scan pour une SORTIE (cf. app.models.enums.MotifSortie côté back). */
interface OptionMotifSortie {
  valeur: MotifSortie;
  libelle: string;
  icone: string;
}

const MOTIFS_SORTIE: OptionMotifSortie[] = [
  { valeur: 'normale', libelle: 'Sortie normale (fin de service)', icone: 'ti-door-exit' },
  { valeur: 'urgence', libelle: 'Urgence', icone: 'ti-alert-triangle' },
  { valeur: 'raison_familiale', libelle: 'Cas familial', icone: 'ti-home-heart' },
  { valeur: 'raison_medicale', libelle: 'Raison médicale', icone: 'ti-first-aid-kit' },
  { valeur: 'autorisation_hierarchie', libelle: 'Autorisation de la hiérarchie', icone: 'ti-user-check' },
  { valeur: 'autre', libelle: 'Autre motif…', icone: 'ti-dots' },
];

@Component({
  selector: 'app-pointage-scan',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pointage-scan.component.html',
  styleUrl: './pointage-scan.component.scss',
})
export class PointageScanComponent implements AfterViewInit, OnDestroy {
  private readonly pointageService = inject(PointageService);

  @ViewChild('videoQr') videoQr?: ElementRef<HTMLVideoElement>;
  @ViewChild('videoFace') videoFace?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasOverlay') canvasOverlay?: ElementRef<HTMLCanvasElement>;

  readonly mode = signal<Mode>('qr');
  readonly typePointage = signal<TypePointage>('entree');
  readonly deviceKey = signal<string>(environment.deviceApiKey);
  readonly matricule = signal<string>('');

  readonly message = signal<string | null>(null);
  readonly erreur = signal<string | null>(null);
  readonly enCours = signal(false);

  readonly qrSupporte = signal<boolean>(false);
  readonly webauthnSupporte = signal<boolean>(false);
  // true si on utilise le repli ZXing (navigateur sans BarcodeDetector natif : Firefox, Safari, iOS…).
  readonly qrModeCompatibilite = signal<boolean>(false);
  // Sous-étape du mode QR : 'scan' (lecture du QR) puis 'confirmation_visage'
  // (double authentification — le QR seul n'identifie que le prétendant ; le
  // visage confirme que c'est bien cet agent-là qui pointe, pas un collègue
  // utilisant son badge).
  readonly etapeQr = signal<'scan' | 'confirmation_visage'>('scan');

  // --------- Sortie exceptionnelle (urgence, cas familial, raison médicale…) ---------
  readonly motifsSortie = MOTIFS_SORTIE;
  readonly motifSortie = signal<MotifSortie>('normale');
  readonly commentaireSortie = signal<string>('');

  // --------- Reconnaissance faciale : comparaison réelle (face-api.js) ---------
  readonly chargementModeles = signal(false);
  readonly modelesPrets = signal(false);
  readonly cameraFaceActive = signal(false);
  readonly visageDetecte = signal(false);
  // true = bouton "Démarrer" affiché, caméra/détection à l'arrêt (mode
  // reconnaissance faciale autonome uniquement) — évite qu'une caméra allumée
  // en continu re-capture le même agent une seconde fois juste après son
  // pointage : il faut un nouveau clic explicite pour chaque agent.
  readonly pretAScannerVisage = signal(true);
  // Progression (0 à 1) de la stabilisation avant capture automatique — sert
  // uniquement à l'affichage d'un indicateur visuel pendant le temps de pose.
  readonly progressionCaptureAuto = signal(0);
  private faceapi: any = null;
  private boucleDetectionFaceActive = false;
  // Horodatage du début de détection continue du visage courant (null si aucun
  // visage détecté depuis la dernière frame) — sert à exiger une pose stable
  // avant de déclencher la capture automatique, pour éviter de capturer une
  // image floue pendant que l'agent se positionne devant la caméra.
  private detectionFaceStableDepuis: number | null = null;
  // Empêche de déclencher plusieurs captures automatiques pour le même passage
  // devant la caméra (le temps de l'envoi + une pause après le résultat, le
  // temps que l'agent s'écarte) — pendant du enPauseDetectionQr côté QR.
  private enPauseCaptureAuto = false;
  private static readonly SEUIL_STABILISATION_MS = 900;
  private static readonly PAUSE_APRES_CAPTURE_MS = 3000;

  private streamQr: MediaStream | null = null;
  private streamFace: MediaStream | null = null;
  private detecteurQr: any = null;
  private boucleQrActive = false;
  private lecteurZxing: BrowserQRCodeReader | null = null;
  private controlesZxing: IScannerControls | null = null;
  // Évite d'envoyer plusieurs fois le même QR code tant qu'il reste sous la caméra.
  private enPauseDetectionQr = false;

  constructor() {
    this.qrSupporte.set(typeof (window as any).BarcodeDetector !== 'undefined');
    this.webauthnSupporte.set(!!(window as any).PublicKeyCredential);
  }

  async ngAfterViewInit() {
    await this.demarrerModeCourant();
  }

  ngOnDestroy() {
    this.arreterTout();
  }

  async surChangementMode(m: Mode) {
    this.arreterTout();
    this.message.set(null);
    this.erreur.set(null);
    this.mode.set(m);
    // Attendre le prochain cycle Angular pour que les <video> soient rendus.
    setTimeout(() => this.demarrerModeCourant(), 50);
  }

  /** Remet le motif de sortie à sa valeur par défaut quand on repasse en mode "entrée". */
  surChangementTypePointage(t: TypePointage) {
    this.typePointage.set(t);
    if (t === 'entree') {
      this.motifSortie.set('normale');
      this.commentaireSortie.set('');
    }
  }

  private async demarrerModeCourant() {
    try {
      if (this.mode() === 'qr') {
        this.etapeQr.set('scan');
        await this.demarrerScanQr();
      } else if (this.mode() === 'facial') {
        // Ne démarre pas la caméra automatiquement : on attend un clic explicite
        // (cf. demarrerReconnaissanceFaciale) pour éviter qu'elle tourne en
        // continu et scanne le même agent plusieurs fois d'affilée.
        this.pretAScannerVisage.set(true);
      }
    } catch (e: any) {
      this.erreur.set(`Impossible d'accéder à la caméra : ${e?.message ?? e}`);
    }
  }

  /** Déclenché par le bouton "Démarrer la reconnaissance faciale" (mode autonome, hors QR). */
  demarrerReconnaissanceFaciale(): void {
    this.erreur.set(null);
    this.pretAScannerVisage.set(false);
    // Attendre le prochain cycle Angular pour que <video #videoFace> soit rendu.
    setTimeout(async () => {
      try {
        await this.demarrerCameraFace();
      } catch (e: any) {
        this.erreur.set(`Impossible d'accéder à la caméra : ${e?.message ?? e}`);
        this.pretAScannerVisage.set(true);
      }
    }, 50);
  }

  /**
   * Construit le payload commun à envoyer au back, en ajoutant le motif de
   * sortie déclaré (uniquement pertinent pour type_pointage = 'sortie').
   * Cf. app.schemas.pointage._SortieDeclaree côté back.
   */
  private baseCharge(): Record<string, unknown> {
    const charge: Record<string, unknown> = { type_pointage: this.typePointage() };
    if (this.typePointage() === 'sortie') {
      charge['motif_sortie'] = this.motifSortie();
      const commentaire = this.commentaireSortie().trim();
      if (commentaire) charge['commentaire'] = commentaire;
    }
    return charge;
  }

  /** Vérifie qu'un commentaire a bien été saisi quand le motif l'exige. */
  private motifValide(): boolean {
    if (this.typePointage() !== 'sortie') return true;
    if (this.motifSortie() === 'autre' && !this.commentaireSortie().trim()) {
      this.erreur.set("Précisez un commentaire pour le motif de sortie « Autre ».");
      return false;
    }
    return true;
  }

  // --------- QR ---------
  private async demarrerScanQr() {
    if (!this.videoQr) return;

    this.streamQr = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    const v = this.videoQr.nativeElement;
    v.srcObject = this.streamQr;
    await v.play();

    if (this.qrSupporte()) {
      // API native du navigateur (Chrome/Edge/Android) : la plus rapide quand elle existe.
      this.qrModeCompatibilite.set(false);
      this.detecteurQr = new BarcodeDetector({ formats: ['qr_code'] });
      this.boucleQrActive = true;
      this.boucleQr();
    } else {
      // Repli universel pour les navigateurs sans BarcodeDetector (Firefox, Safari, iOS…).
      // Chargé dynamiquement pour ne pas alourdir le bundle des navigateurs qui n'en ont pas besoin.
      this.qrModeCompatibilite.set(true);
      if (!this.lecteurZxing) {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        this.lecteurZxing = new BrowserQRCodeReader();
      }
      this.controlesZxing = await this.lecteurZxing.decodeFromStream(this.streamQr, v, (resultat) => {
        if (resultat) {
          this.gererCodeQrDetecte(resultat.getText());
        }
        // Les erreurs de type "aucun code trouvé sur cette image" sont normales
        // entre deux passages de QR code devant la caméra : on les ignore.
      });
    }
  }

  private async boucleQr() {
    if (!this.boucleQrActive || !this.videoQr || !this.detecteurQr) return;
    try {
      const codes = await this.detecteurQr.detect(this.videoQr.nativeElement);
      if (codes && codes.length > 0) {
        await this.gererCodeQrDetecte(codes[0].rawValue as string);
      }
    } catch {
      /* ignorer les erreurs transitoires du détecteur */
    }
    requestAnimationFrame(() => this.boucleQr());
  }

  /**
   * Traite un QR code détecté, quel que soit le moteur (BarcodeDetector natif ou ZXing).
   * Une garde évite d'envoyer plusieurs fois le même pointage tant que le QR code
   * reste visible sous la caméra (l'agent a le temps de s'écarter).
   */
  private async gererCodeQrDetecte(contenu: string) {
    if (this.enPauseDetectionQr) return;
    if (!this.motifValide()) return;
    this.enPauseDetectionQr = true;

    // Double authentification : le QR seul n'identifie que le prétendant à ce
    // matricule. On bascule sur la caméra faciale pour vérifier en 1:1 que
    // c'est bien cet agent-là qui se présente — empêche qu'un agent pointe
    // avec le QR/badge d'un collègue (cf. PointageFacialCreate.matricule côté
    // back : vérification 1:1 déjà supportée, aucun changement backend requis).
    const matriculeLu = contenu.trim();
    this.arreterCameraQr();
    this.matricule.set(matriculeLu);
    this.etapeQr.set('confirmation_visage');
    this.message.set(null);
    this.erreur.set(null);
    // Attendre le prochain cycle Angular pour que <video #videoFace> soit rendu
    // (même précaution que surChangementMode).
    setTimeout(async () => {
      try {
        await this.demarrerCameraFace();
      } catch (e: any) {
        this.erreur.set(`Impossible d'accéder à la caméra faciale : ${e?.message ?? e}`);
      }
    }, 50);
  }

  // --------- Facial : capture + comparaison réelle (face-api.js) ---------
  // La reconnaissance faciale au poste de scan calcule ici le même vecteur
  // 128-D qu'à l'enrôlement (cf. agent-biometrie-modal.component.ts), afin
  // que le back-end compare systématiquement ce vecteur à l'empreinte de
  // référence de l'agent avant de valider ou de rejeter le pointage — jamais
  // uniquement sur la foi du matricule saisi.
  private async demarrerCameraFace() {
    if (!this.videoFace) return;
    this.erreur.set(null);
    await this.chargerModelesFaciaux();
    this.streamFace = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
    const v = this.videoFace.nativeElement;
    v.srcObject = this.streamFace;
    await v.play();
    this.cameraFaceActive.set(true);
    this.boucleDetectionFaceActive = true;
    this.boucleDetectionFace();
  }

  private async chargerModelesFaciaux(): Promise<void> {
    if (this.modelesPrets()) return;
    this.chargementModeles.set(true);
    try {
      const faceapi = await import('face-api.js');
      this.faceapi = faceapi;
      const url = environment.faceApiModelsUrl;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      this.modelesPrets.set(true);
    } catch (e: any) {
      this.erreur.set(
        `Échec du chargement des modèles de reconnaissance faciale : ${e?.message ?? e}. Vérifiez la connexion réseau.`
      );
    } finally {
      this.chargementModeles.set(false);
    }
  }

  private async boucleDetectionFace(): Promise<void> {
    if (!this.boucleDetectionFaceActive || !this.videoFace || !this.canvasOverlay || !this.faceapi) return;
    try {
      const detection = await this.faceapi
        .detectSingleFace(this.videoFace.nativeElement, new this.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();
      const canvas = this.canvasOverlay.nativeElement;
      const v = this.videoFace.nativeElement;
      canvas.width = v.clientWidth;
      canvas.height = v.clientHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (detection) {
          const dims = { width: canvas.width, height: canvas.height };
          const resized = this.faceapi.resizeResults(detection, dims);
          ctx.strokeStyle = '#1fb6a4';
          ctx.lineWidth = 2;
          const b = resized.detection.box;
          ctx.strokeRect(b.x, b.y, b.width, b.height);
        }
      }
      this.visageDetecte.set(!!detection);
      this.suivreStabiliteEtDeclencherCaptureAuto(!!detection);
    } catch {
      /* transitoire : ignorer, la détection reprend à la frame suivante */
    }
    if (this.boucleDetectionFaceActive) requestAnimationFrame(() => this.boucleDetectionFace());
  }

  /**
   * Pointage facial automatique : dès qu'un visage reste détecté sans
   * interruption pendant SEUIL_STABILISATION_MS (le temps que l'agent se
   * positionne correctement, pour éviter de capturer une image floue en
   * mouvement), la capture et l'envoi se déclenchent sans action de
   * l'agent. Une pause (PAUSE_APRES_CAPTURE_MS) suit chaque tentative pour
   * laisser le temps de s'écarter avant qu'un nouveau visage ne redéclenche
   * une capture — sans quoi le même passage devant la caméra pourrait
   * envoyer plusieurs pointages d'affilée.
   */
  private suivreStabiliteEtDeclencherCaptureAuto(detecte: boolean): void {
    if (!detecte) {
      this.detectionFaceStableDepuis = null;
      this.progressionCaptureAuto.set(0);
      return;
    }
    if (this.enPauseCaptureAuto || this.enCours() || !this.modelesPrets()) {
      return;
    }
    if (this.detectionFaceStableDepuis === null) {
      this.detectionFaceStableDepuis = performance.now();
    }
    const duree = performance.now() - this.detectionFaceStableDepuis;
    this.progressionCaptureAuto.set(Math.min(1, duree / PointageScanComponent.SEUIL_STABILISATION_MS));

    if (duree >= PointageScanComponent.SEUIL_STABILISATION_MS) {
      this.enPauseCaptureAuto = true;
      this.detectionFaceStableDepuis = null;
      void this.capturerVisage();
    }
  }

  async capturerVisage(): Promise<void> {
    if (!this.videoFace || !this.faceapi || !this.modelesPrets()) return;
    if (!this.motifValide()) {
      this.liberePauseCaptureAutoApresDelai();
      return;
    }

    this.enCours.set(true);
    this.message.set(null);
    this.erreur.set(null);
    try {
      // Recalcule un descripteur au moment précis de la capture (et non celui,
      // potentiellement périmé, de la boucle d'aperçu) pour comparer l'instant réel du pointage.
      const resultat = await this.faceapi
        .detectSingleFace(this.videoFace.nativeElement, new this.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!resultat) {
        this.erreur.set('Aucun visage détecté. Cadrez le visage face à la caméra puis réessayez.');
        this.enCours.set(false);
        this.liberePauseCaptureAutoApresDelai(500);
        return;
      }
      const encodageFacial = Array.from(resultat.descriptor as Float32Array);
      const matricule = this.matricule().trim();
      // Le matricule est facultatif en mode facial : s'il est saisi, le back
      // fait une vérification 1:1 (comparaison contre cet agent uniquement) ;
      // s'il est omis, le back identifie l'agent par identification 1:N sur
      // l'ensemble des empreintes enregistrées (cf. app/schemas/pointage.py
      // PointageFacialCreate et app/services/pointage_service.identifier_par_visage).
      await this.envoyerPointage('facial', {
        ...(matricule ? { matricule } : {}),
        encodage_facial: encodageFacial,
        ...this.baseCharge(),
      });
      this.liberePauseCaptureAutoApresDelai();
    } catch (e: any) {
      this.enCours.set(false);
      this.erreur.set(`Échec de la capture : ${e?.message ?? e}`);
      this.liberePauseCaptureAutoApresDelai(500);
    }
  }

  /** Réautorise une nouvelle capture automatique après un court délai (laisse l'agent s'écarter). */
  private liberePauseCaptureAutoApresDelai(delaiMs: number = PointageScanComponent.PAUSE_APRES_CAPTURE_MS): void {
    setTimeout(() => {
      this.enPauseCaptureAuto = false;
      this.progressionCaptureAuto.set(0);
    }, delaiMs);
  }

  // --------- WebAuthn ---------
  async pointerWebauthn() {
    const matricule = this.matricule().trim();
    if (!matricule) {
      this.erreur.set('Saisissez le matricule de l\'agent pour l\'authentification biométrique.');
      return;
    }
    if (!this.webauthnSupporte()) {
      this.erreur.set('WebAuthn n\'est pas disponible sur cet appareil.');
      return;
    }
    if (!this.motifValide()) return;
    this.enCours.set(true);
    this.message.set(null);
    this.erreur.set(null);
    try {
      // 1) Récupère le challenge émis et conservé côté serveur pour ce matricule.
      const options = await new Promise<any>((resolve, reject) =>
        this.pointageService.optionsWebauthn(matricule, this.deviceKey()).subscribe({ next: resolve, error: reject })
      );
      // 2) Dialogue avec l'authentificateur (Touch ID / Windows Hello / empreinte téléphone).
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const assertion = await startAuthentication({ optionsJSON: options });
      // 3) Envoie l'assertion signée : le back la vérifie contre la clé publique enregistrée.
      await this.envoyerPointage('webauthn', {
        matricule,
        webauthn: assertion,
        ...this.baseCharge(),
      });
    } catch (e: any) {
      this.erreur.set(`Échec biométrique : ${e?.error?.detail ?? e?.message ?? e}`);
    } finally {
      this.enCours.set(false);
    }
  }

  // --------- Envoi commun ---------
  private async envoyerPointage(mode: 'qr' | 'facial' | 'webauthn', payload: Record<string, unknown>) {
    this.enCours.set(true);
    this.message.set(null);
    this.erreur.set(null);
    this.pointageService
      .pointer(mode, payload, this.deviceKey())
      .pipe(finalize(() => this.enCours.set(false)))
      .subscribe({
        next: (r) => {
          const nom = r.pointage?.agent
            ? `${r.pointage.agent.prenom} ${r.pointage.agent.nom}`
            : `Agent #${r.pointage?.id_agent}`;
          const libelleType = this.typePointage() === 'entree' ? 'Entrée' : 'Sortie';
          const motif = r.pointage?.motif_sortie;
          const suffixeMotif = motif && motif !== 'normale' ? ` (${this.libelleMotif(motif)})` : '';
          this.message.set(`✓ ${libelleType}${suffixeMotif} enregistrée pour ${nom}`);
          if (r.anomalie_detectee) {
            this.message.update((m) => `${m} — anomalie : ${r.anomalie_detectee}`);
          }
          // Repart sur une base propre pour le prochain agent.
          this.commentaireSortie.set('');
          this.motifSortie.set('normale');
          if (mode === 'facial') void this.apresPointageFacial();
        },
        error: (err) => {
          const detail = err?.error?.detail ?? 'Le pointage n\'a pas pu être enregistré.';
          this.erreur.set(detail);
          if (mode === 'facial') void this.apresPointageFacial();
        },
      });
  }

  /**
   * Après un pointage facial (succès ou échec) :
   * - si on venait de la confirmation QR (double authentification), revient
   *   au scan QR pour l'agent suivant ;
   * - si on est en mode reconnaissance faciale autonome, coupe la caméra et
   *   réaffiche le bouton de démarrage (un clic = un agent, jamais de scan
   *   en continu qui pourrait re-capturer deux fois la même personne).
   */
  private async apresPointageFacial(): Promise<void> {
    if (this.mode() === 'qr' && this.etapeQr() === 'confirmation_visage') {
      await this.terminerConfirmationQr();
    } else if (this.mode() === 'facial') {
      this.arreterCameraFaceLocal();
      this.pretAScannerVisage.set(true);
    }
  }

  private libelleMotif(motif: MotifSortie): string {
    return this.motifsSortie.find((m) => m.valeur === motif)?.libelle ?? motif;
  }

  private arreterCameraQr(): void {
    this.boucleQrActive = false;
    this.controlesZxing?.stop();
    this.controlesZxing = null;
    this.streamQr?.getTracks().forEach((t) => t.stop());
    this.streamQr = null;
  }

  private arreterCameraFaceLocal(): void {
    this.boucleDetectionFaceActive = false;
    this.cameraFaceActive.set(false);
    this.visageDetecte.set(false);
    this.detectionFaceStableDepuis = null;
    this.enPauseCaptureAuto = false;
    this.progressionCaptureAuto.set(0);
    this.streamFace?.getTracks().forEach((t) => t.stop());
    this.streamFace = null;
  }

  /** Fin de la confirmation faciale (succès ou échec) : relance le scan QR pour l'agent suivant. */
  private async terminerConfirmationQr(): Promise<void> {
    this.arreterCameraFaceLocal();
    this.matricule.set('');
    this.etapeQr.set('scan');
    this.enPauseDetectionQr = false;
    // Petite pause pour laisser le temps de lire le message avant de relancer le scan.
    setTimeout(() => {
      if (this.mode() === 'qr' && this.etapeQr() === 'scan') void this.demarrerScanQr();
    }, 1200);
  }

  /** Bouton "Annuler" pendant la confirmation faciale (ex. QR mal lu) — relance directement le scan QR. */
  annulerConfirmationQr(): void {
    if (this.mode() !== 'qr' || this.etapeQr() !== 'confirmation_visage') return;
    this.message.set(null);
    this.erreur.set(null);
    void this.terminerConfirmationQr();
  }

  private arreterTout() {
    this.arreterCameraQr();
    this.arreterCameraFaceLocal();
    this.etapeQr.set('scan');
    this.pretAScannerVisage.set(true);
  }
}
