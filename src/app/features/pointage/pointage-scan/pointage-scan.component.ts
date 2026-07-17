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

interface OptionMotif {
  valeur: MotifSortie;
  libelle: string;
}

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
  @ViewChild('canvasFace') canvasFace?: ElementRef<HTMLCanvasElement>;

  readonly mode = signal<Mode>('qr');
  readonly typePointage = signal<TypePointage>('entree');
  readonly deviceKey = signal<string>(environment.deviceApiKey);
  readonly matricule = signal<string>('');

  // Motif de sortie : demandé uniquement quand le type de pointage est « sortie ».
  // Permet de tracer les sorties exceptionnelles (urgence, cas familial, mission…)
  // en plus de la sortie normale de fin de service.
  readonly motifSortie = signal<MotifSortie>('fin_service');
  readonly commentaireMotif = signal<string>('');

  readonly optionsMotifSortie: OptionMotif[] = [
    { valeur: 'fin_service', libelle: 'Fin de service (sortie normale)' },
    { valeur: 'urgence', libelle: 'Urgence' },
    { valeur: 'cas_familial', libelle: 'Cas familial' },
    { valeur: 'medical', libelle: 'Rendez-vous médical' },
    { valeur: 'mission', libelle: 'Mission extérieure' },
    { valeur: 'pause', libelle: 'Pause / déjeuner' },
    { valeur: 'autre', libelle: 'Autre motif' },
  ];

  readonly message = signal<string | null>(null);
  readonly erreur = signal<string | null>(null);
  readonly enCours = signal(false);

  readonly qrSupporte = signal<boolean>(false);
  readonly webauthnSupporte = signal<boolean>(false);
  // true si on utilise le repli ZXing (navigateur sans BarcodeDetector natif : Firefox, Safari, iOS…).
  readonly qrModeCompatibilite = signal<boolean>(false);

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

  private async demarrerModeCourant() {
    try {
      if (this.mode() === 'qr') await this.demarrerScanQr();
      else if (this.mode() === 'facial') await this.demarrerCameraFace();
    } catch (e: any) {
      this.erreur.set(`Impossible d'accéder à la caméra : ${e?.message ?? e}`);
    }
  }

  /**
   * Construit la partie « motif de sortie » du payload (facultative).
   * N'ajoute rien pour une entrée : le back-end conserve alors la valeur NULL.
   */
  private champsMotifSortie(): Record<string, unknown> {
    if (this.typePointage() !== 'sortie') return {};
    const motif = this.motifSortie();
    const commentaire = this.commentaireMotif().trim();
    const champs: Record<string, unknown> = { motif_sortie: motif };
    if (commentaire) champs['commentaire_motif'] = commentaire;
    return champs;
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
    this.enPauseDetectionQr = true;
    // Le QR agent encode uniquement le matricule (cf. app/schemas/pointage.py
    // _IdentifiantAgent — « le QR code ou le badge encode le matricule »).
    await this.envoyerPointage('qr', {
      matricule: contenu.trim(),
      type_pointage: this.typePointage(),
      ...this.champsMotifSortie(),
    });
    setTimeout(() => {
      this.enPauseDetectionQr = false;
    }, 1500);
  }

  // --------- Facial ---------
  private async demarrerCameraFace() {
    if (!this.videoFace) return;
    this.streamFace = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
    const v = this.videoFace.nativeElement;
    v.srcObject = this.streamFace;
    await v.play();
  }

  capturerVisage() {
    if (!this.videoFace || !this.canvasFace) return;
    if (!this.matricule().trim()) {
      this.erreur.set('Saisissez le matricule de l\'agent avant la capture faciale.');
      return;
    }
    const v = this.videoFace.nativeElement;
    const c = this.canvasFace.nativeElement;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.8);
    const base64 = dataUrl.split(',')[1];
    this.envoyerPointage('facial', {
      matricule: this.matricule().trim(),
      type_pointage: this.typePointage(),
      image_base64: base64,
      ...this.champsMotifSortie(),
    });
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
        type_pointage: this.typePointage(),
        webauthn: assertion,
        ...this.champsMotifSortie(),
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
          let suffixe = '';
          if (this.typePointage() === 'sortie') {
            const opt = this.optionsMotifSortie.find((o) => o.valeur === this.motifSortie());
            if (opt) suffixe = ` — motif : ${opt.libelle}`;
          }
          this.message.set(`✓ ${libelleType} enregistrée pour ${nom}${suffixe}`);
          if (r.anomalie_detectee) {
            this.message.update((m) => `${m} — anomalie : ${r.anomalie_detectee}`);
          }
          // Réinitialise le commentaire libre après un envoi réussi (le motif reste
          // sélectionné : plusieurs agents sortent souvent pour la même raison, ex. fin de service).
          this.commentaireMotif.set('');
        },
        error: (err) => {
          const detail = err?.error?.detail ?? 'Le pointage n\'a pas pu être enregistré.';
          this.erreur.set(detail);
        },
      });
  }

  private arreterTout() {
    this.boucleQrActive = false;
    this.controlesZxing?.stop();
    this.controlesZxing = null;
    for (const s of [this.streamQr, this.streamFace]) {
      s?.getTracks().forEach((t) => t.stop());
    }
    this.streamQr = null;
    this.streamFace = null;
  }
}
