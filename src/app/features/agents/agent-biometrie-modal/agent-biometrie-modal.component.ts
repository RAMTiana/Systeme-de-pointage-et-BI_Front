import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AgentOut } from '../../../core/models/agent.model';
import { AgentService } from '../../../core/services/agent.service';

type Onglet = 'qr' | 'facial' | 'webauthn';

/**
 * Modale d'enrôlement biométrique d'un agent (module Agents) : réunit les
 * trois moyens d'identification utilisés ensuite au poste de pointage
 * (cf. app/features/pointage/pointage-scan) :
 *   - QR code (encode le matricule, rien à enregistrer côté serveur) ;
 *   - reconnaissance faciale (calcule un vecteur 128-D dans le navigateur
 *     via face-api.js, puis l'enregistre via PUT /agents/{id}/empreinte-faciale) ;
 *   - biométrie de l'appareil / WebAuthn (Touch ID, Windows Hello, empreinte
 *     digitale du téléphone) via GET+PUT /agents/{id}/webauthn.
 */
@Component({
  selector: 'app-agent-biometrie-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './agent-biometrie-modal.component.html',
  styleUrl: './agent-biometrie-modal.component.scss',
})
export class AgentBiometrieModalComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly agentService = inject(AgentService);

  @Input({ required: true }) agent!: AgentOut;

  @Output() fermer = new EventEmitter<void>();
  /** Émis à chaque changement d'état biométrique, pour que la liste se mette à jour sans rechargement. */
  @Output() agentMisAJour = new EventEmitter<AgentOut>();

  @ViewChild('canvasQr') canvasQr?: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoFace') videoFace?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasFace') canvasFace?: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasOverlay') canvasOverlay?: ElementRef<HTMLCanvasElement>;

  readonly onglet = signal<Onglet>('qr');

  // --------- QR ---------
  readonly qrGenere = signal(false);

  // --------- Facial ---------
  readonly chargementModeles = signal(false);
  readonly modelesPrets = signal(false);
  readonly cameraActive = signal(false);
  readonly visageDetecte = signal(false);
  readonly enCoursFacial = signal(false);
  readonly erreurFacial = signal<string | null>(null);
  readonly messageFacial = signal<string | null>(null);
  readonly consentementEnCours = signal(false);

  private streamFace: MediaStream | null = null;
  private faceapi: any = null;
  private boucleDetectionActive = false;

  // --------- WebAuthn ---------
  readonly webauthnSupporte = signal(!!(window as any).PublicKeyCredential);
  readonly enCoursWebauthn = signal(false);
  readonly erreurWebauthn = signal<string | null>(null);
  readonly messageWebauthn = signal<string | null>(null);
  nomAppareil = '';

  ngAfterViewInit(): void {
    this.genererQr();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['agent'] && !changes['agent'].firstChange) {
      // Agent remplacé (rare, la modale reste ouverte le temps d'un seul agent) : régénère le QR.
      setTimeout(() => this.genererQr(), 0);
    }
  }

  ngOnDestroy(): void {
    this.arreterCamera();
  }

  fermerModale(): void {
    this.arreterCamera();
    this.fermer.emit();
  }

  async changerOnglet(o: Onglet): Promise<void> {
    if (this.onglet() === o) return;
    this.arreterCamera();
    this.erreurFacial.set(null);
    this.messageFacial.set(null);
    this.erreurWebauthn.set(null);
    this.messageWebauthn.set(null);
    this.onglet.set(o);
    if (o === 'qr') {
      setTimeout(() => this.genererQr(), 0);
    } else if (o === 'facial') {
      setTimeout(() => this.demarrerFacial(), 0);
    }
  }

  // ====================================================================
  // QR code — encode simplement le matricule (identique à ce que lit le
  // scanner du poste de pointage, cf. pointage-scan.component.ts).
  // ====================================================================

  private async genererQr(): Promise<void> {
    if (this.onglet() !== 'qr' || !this.canvasQr) return;
    const QRCode = (await import('qrcode')).default;
    await QRCode.toCanvas(this.canvasQr.nativeElement, this.agent.matricule, {
      width: 240,
      margin: 1,
      color: { dark: '#0f3d5c', light: '#ffffff' },
    });
    this.qrGenere.set(true);
  }

  telechargerQr(): void {
    if (!this.canvasQr) return;
    const lien = document.createElement('a');
    lien.download = `qr-agent-${this.agent.matricule}.png`;
    lien.href = this.canvasQr.nativeElement.toDataURL('image/png');
    lien.click();
  }

  imprimerQr(): void {
    if (!this.canvasQr) return;
    const image = this.canvasQr.nativeElement.toDataURL('image/png');
    const fenetre = window.open('', '_blank', 'width=420,height=520');
    if (!fenetre) return;
    fenetre.document.write(`
      <html>
        <head><title>Badge — ${this.agent.matricule}</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 24px;">
          <h3>${this.agent.prenom} ${this.agent.nom}</h3>
          <p>${this.agent.matricule}</p>
          <img src="${image}" width="240" height="240" />
        </body>
      </html>
    `);
    fenetre.document.close();
    fenetre.focus();
    fenetre.print();
  }

  // ====================================================================
  // Reconnaissance faciale — capture webcam + calcul du vecteur 128-D
  // (face-api.js) directement dans le navigateur, jamais l'image envoyée.
  // ====================================================================

  donnerConsentement(): void {
    this.consentementEnCours.set(true);
    this.agentService.definirConsentementFacial(this.agent.id_agent, true).subscribe({
      next: (agentMaj) => {
        this.consentementEnCours.set(false);
        this.agent = agentMaj;
        this.agentMisAJour.emit(agentMaj);
        this.demarrerFacial();
      },
      error: () => {
        this.consentementEnCours.set(false);
        this.erreurFacial.set('Impossible d\'enregistrer le consentement.');
      },
    });
  }

  private async demarrerFacial(): Promise<void> {
    if (!this.agent.consentement_facial) return; // affiche l'écran de consentement à la place
    this.erreurFacial.set(null);
    try {
      await this.chargerModeles();
      if (!this.videoFace) return;
      this.streamFace = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      const v = this.videoFace.nativeElement;
      v.srcObject = this.streamFace;
      await v.play();
      this.cameraActive.set(true);
      this.boucleDetectionActive = true;
      this.boucleDetection();
    } catch (e: any) {
      this.erreurFacial.set(`Impossible d'accéder à la caméra : ${e?.message ?? e}`);
    }
  }

  private async chargerModeles(): Promise<void> {
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
      this.erreurFacial.set(
        `Échec du chargement des modèles de reconnaissance faciale : ${e?.message ?? e}. Vérifiez la connexion réseau.`
      );
    } finally {
      this.chargementModeles.set(false);
    }
  }

  private async boucleDetection(): Promise<void> {
    if (!this.boucleDetectionActive || !this.videoFace || !this.canvasOverlay || !this.faceapi) return;
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
    } catch {
      /* transitoire : ignorer, la détection reprend à la frame suivante */
    }
    if (this.boucleDetectionActive) requestAnimationFrame(() => this.boucleDetection());
  }

  async capturerEtEnregistrer(): Promise<void> {
    if (!this.videoFace || !this.faceapi) return;
    this.enCoursFacial.set(true);
    this.erreurFacial.set(null);
    this.messageFacial.set(null);
    try {
      const resultat = await this.faceapi
        .detectSingleFace(this.videoFace.nativeElement, new this.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!resultat) {
        this.erreurFacial.set('Aucun visage détecté. Cadrez le visage face à la caméra puis réessayez.');
        return;
      }
      const vecteur = Array.from(resultat.descriptor as Float32Array);
      this.agentService.enregistrerEmpreinteFaciale(this.agent.id_agent, vecteur).subscribe({
        next: () => {
          this.messageFacial.set('Empreinte faciale enregistrée. Le pointage par reconnaissance faciale est activé.');
          const agentMaj: AgentOut = { ...this.agent, empreinte_faciale_enregistree: true };
          this.agent = agentMaj;
          this.agentMisAJour.emit(agentMaj);
        },
        error: (err) => {
          this.erreurFacial.set(err?.error?.detail ?? "Impossible d'enregistrer l'empreinte faciale.");
        },
        complete: () => this.enCoursFacial.set(false),
      });
      return;
    } catch (e: any) {
      this.erreurFacial.set(`Échec de la capture : ${e?.message ?? e}`);
    }
    this.enCoursFacial.set(false);
  }

  supprimerEmpreinte(): void {
    if (!confirm("Supprimer l'empreinte faciale de cet agent ? Le pointage facial sera désactivé.")) return;
    this.agentService.supprimerEmpreinteFaciale(this.agent.id_agent).subscribe({
      next: () => {
        const agentMaj: AgentOut = { ...this.agent, empreinte_faciale_enregistree: false };
        this.agent = agentMaj;
        this.agentMisAJour.emit(agentMaj);
        this.messageFacial.set(null);
      },
      error: () => this.erreurFacial.set("Impossible de supprimer l'empreinte faciale."),
    });
  }

  private arreterCamera(): void {
    this.boucleDetectionActive = false;
    this.streamFace?.getTracks().forEach((t) => t.stop());
    this.streamFace = null;
    this.cameraActive.set(false);
    this.visageDetecte.set(false);
  }

  // ====================================================================
  // Biométrie de l'appareil (WebAuthn) — Touch ID / Windows Hello /
  // empreinte digitale du téléphone utilisé pour pointer.
  // ====================================================================

  enrolerWebauthn(): void {
    if (!this.webauthnSupporte()) {
      this.erreurWebauthn.set("WebAuthn n'est pas disponible sur cet appareil/navigateur.");
      return;
    }
    this.enCoursWebauthn.set(true);
    this.erreurWebauthn.set(null);
    this.messageWebauthn.set(null);

    this.agentService
      .obtenirOptionsWebauthn(this.agent.id_agent)
      .pipe(finalize(() => undefined))
      .subscribe({
        next: async (options) => {
          try {
            const { startRegistration } = await import('@simplewebauthn/browser');
            const credential = await startRegistration({ optionsJSON: options });
            this.agentService
              .enregistrerWebauthn(this.agent.id_agent, credential, this.nomAppareil.trim() || null)
              .pipe(finalize(() => this.enCoursWebauthn.set(false)))
              .subscribe({
                next: () => {
                  this.messageWebauthn.set('Biométrie de l\'appareil enregistrée. Le pointage biométrique est activé.');
                  const agentMaj: AgentOut = { ...this.agent, webauthn_enregistre: true };
                  this.agent = agentMaj;
                  this.agentMisAJour.emit(agentMaj);
                  this.nomAppareil = '';
                },
                error: (err) => this.erreurWebauthn.set(err?.error?.detail ?? "Impossible d'enregistrer l'identifiant."),
              });
          } catch (e: any) {
            this.enCoursWebauthn.set(false);
            this.erreurWebauthn.set(`Enrôlement annulé ou échoué : ${e?.message ?? e}`);
          }
        },
        error: (err) => {
          this.enCoursWebauthn.set(false);
          this.erreurWebauthn.set(err?.error?.detail ?? "Impossible d'obtenir les options d'enrôlement.");
        },
      });
  }

  supprimerWebauthn(): void {
    if (!confirm("Supprimer l'identifiant biométrique de cet agent ? Le pointage biométrique sera désactivé.")) return;
    this.agentService.supprimerWebauthn(this.agent.id_agent).subscribe({
      next: () => {
        const agentMaj: AgentOut = { ...this.agent, webauthn_enregistre: false };
        this.agent = agentMaj;
        this.agentMisAJour.emit(agentMaj);
        this.messageWebauthn.set(null);
      },
      error: () => this.erreurWebauthn.set("Impossible de supprimer l'identifiant biométrique."),
    });
  }
}
