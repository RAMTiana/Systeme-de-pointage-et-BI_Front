import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import type { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';

import { environment } from '../../../../environments/environment';
import { PointageService } from '../../../core/services/pointage.service';
import { TypePointage } from '../../../core/models/pointage.model';

// BarcodeDetector n'est pas typé par défaut dans TS.
declare const BarcodeDetector: any;

type Mode = 'qr' | 'facial' | 'webauthn';

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

  readonly message = signal<string | null>(null);
  readonly erreur = signal<string | null>(null);
  readonly enCours = signal(false);

  readonly qrSupporte = signal<boolean>(false);
  readonly webauthnSupporte = signal<boolean>(false);
  readonly qrModeCompatibilite = signal<boolean>(false);

  // Statut chargement des modèles face-api pour la comparaison faciale.
  readonly chargementModelesFacial = signal(false);
  readonly modelesFacialPrets = signal(false);

  private streamQr: MediaStream | null = null;
  private streamFace: MediaStream | null = null;
  private detecteurQr: any = null;
  private boucleQrActive = false;
  private lecteurZxing: BrowserQRCodeReader | null = null;
  private controlesZxing: IScannerControls | null = null;
  private enPauseDetectionQr = false;

  // face-api.js chargé dynamiquement (comme dans la modale d'enrôlement) pour
  // calculer localement le vecteur 128-D à envoyer au back, qui le comparera
  // à l'empreinte de référence avant de valider le pointage.
  private faceapi: any = null;

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
      this.qrModeCompatibilite.set(false);
      this.detecteurQr = new BarcodeDetector({ formats: ['qr_code'] });
      this.boucleQrActive = true;
      this.boucleQr();
    } else {
      this.qrModeCompatibilite.set(true);
      if (!this.lecteurZxing) {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        this.lecteurZxing = new BrowserQRCodeReader();
      }
      this.controlesZxing = await this.lecteurZxing.decodeFromStream(this.streamQr, v, (resultat) => {
        if (resultat) {
          this.gererCodeQrDetecte(resultat.getText());
        }
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

  private async gererCodeQrDetecte(contenu: string) {
    if (this.enPauseDetectionQr) return;
    this.enPauseDetectionQr = true;
    await this.envoyerPointage('qr', { matricule: contenu.trim(), type_pointage: this.typePointage() });
    setTimeout(() => {
      this.enPauseDetectionQr = false;
    }, 1500);
  }

  // --------- Facial ---------
  private async demarrerCameraFace() {
    if (!this.videoFace) return;
    // Charge les modèles face-api.js en parallèle du démarrage caméra pour
    // que la comparaison soit prête au moment de la capture.
    this.chargerModelesFacial();
    this.streamFace = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
    const v = this.videoFace.nativeElement;
    v.srcObject = this.streamFace;
    await v.play();
  }

  private async chargerModelesFacial(): Promise<void> {
    if (this.modelesFacialPrets() || this.chargementModelesFacial()) return;
    this.chargementModelesFacial.set(true);
    try {
      const faceapi = await import('face-api.js');
      this.faceapi = faceapi;
      const url = environment.faceApiModelsUrl;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      this.modelesFacialPrets.set(true);
    } catch (e: any) {
      this.erreur.set(
        `Échec du chargement des modèles de reconnaissance faciale : ${e?.message ?? e}. Vérifiez la connexion réseau.`
      );
    } finally {
      this.chargementModelesFacial.set(false);
    }
  }

  async capturerVisage() {
    if (!this.videoFace || !this.canvasFace) return;
    if (!this.matricule().trim()) {
      this.erreur.set('Saisissez le matricule de l\'agent avant la capture faciale.');
      return;
    }

    this.enCours.set(true);
    this.message.set(null);
    this.erreur.set(null);

    try {
      // S'assurer que les modèles sont chargés avant de calculer le descripteur.
      if (!this.modelesFacialPrets()) {
        await this.chargerModelesFacial();
      }
      if (!this.faceapi || !this.modelesFacialPrets()) {
        this.erreur.set('Modèles de reconnaissance faciale indisponibles. Impossible de comparer l\'identité.');
        this.enCours.set(false);
        return;
      }

      // Calcul du vecteur 128-D (descripteur) directement dans le navigateur,
      // comme lors de l'enrôlement (agent-biometrie-modal). Le back-end compare
      // ce vecteur à l'empreinte de référence (distance euclidienne, seuil
      // paramétrable) et rejette le pointage si l'identité ne correspond pas.
      const resultat = await this.faceapi
        .detectSingleFace(this.videoFace.nativeElement, new this.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!resultat) {
        this.erreur.set('Aucun visage détecté. Cadrez le visage face à la caméra puis réessayez.');
        this.enCours.set(false);
        return;
      }

      const encodage_facial = Array.from(resultat.descriptor as Float32Array);

      // Capture image d'appoint (traçabilité) — le back n'en a plus besoin
      // pour l'identification puisqu'on lui fournit le vecteur, mais on peut
      // la conserver pour audit visuel si le schéma l'accepte.
      const v = this.videoFace.nativeElement;
      const c = this.canvasFace.nativeElement;
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      let image_base64: string | undefined;
      if (ctx) {
        ctx.drawImage(v, 0, 0, c.width, c.height);
        image_base64 = c.toDataURL('image/jpeg', 0.8).split(',')[1];
      }

      await this.envoyerPointage('facial', {
        matricule: this.matricule().trim(),
        type_pointage: this.typePointage(),
        encodage_facial,
        ...(image_base64 ? { image_base64 } : {}),
      });
    } catch (e: any) {
      this.erreur.set(`Échec de la capture : ${e?.message ?? e}`);
      this.enCours.set(false);
    }
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
      const options = await new Promise<any>((resolve, reject) =>
        this.pointageService.optionsWebauthn(matricule, this.deviceKey()).subscribe({ next: resolve, error: reject })
      );
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const assertion = await startAuthentication({ optionsJSON: options });
      await this.envoyerPointage('webauthn', {
        matricule,
        type_pointage: this.typePointage(),
        webauthn: assertion,
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
          this.message.set(
            `✓ ${this.typePointage() === 'entree' ? 'Entrée' : 'Sortie'} enregistrée pour ${nom}`
          );
          if (r.anomalie_detectee) {
            this.message.update((m) => `${m} — anomalie : ${r.anomalie_detectee}`);
          }
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