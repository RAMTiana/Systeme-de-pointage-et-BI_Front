import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

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
  readonly deviceKey = signal<string>('change-me-device-key');
  readonly matricule = signal<string>('');

  readonly message = signal<string | null>(null);
  readonly erreur = signal<string | null>(null);
  readonly enCours = signal(false);

  readonly qrSupporte = signal<boolean>(false);
  readonly webauthnSupporte = signal<boolean>(false);

  private streamQr: MediaStream | null = null;
  private streamFace: MediaStream | null = null;
  private detecteurQr: any = null;
  private boucleQrActive = false;

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

  // --------- QR ---------
  private async demarrerScanQr() {
    if (!this.videoQr) return;
    if (!this.qrSupporte()) {
      this.erreur.set(
        "Ce navigateur ne supporte pas BarcodeDetector. Utilisez Chrome/Edge, ou installez @zxing/browser."
      );
      return;
    }
    this.streamQr = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    const v = this.videoQr.nativeElement;
    v.srcObject = this.streamQr;
    await v.play();
    this.detecteurQr = new BarcodeDetector({ formats: ['qr_code'] });
    this.boucleQrActive = true;
    this.boucleQr();
  }

  private async boucleQr() {
    if (!this.boucleQrActive || !this.videoQr || !this.detecteurQr) return;
    try {
      const codes = await this.detecteurQr.detect(this.videoQr.nativeElement);
      if (codes && codes.length > 0) {
        const contenu = codes[0].rawValue as string;
        this.boucleQrActive = false;
        await this.envoyerPointage('qr', { qr_code: contenu, type_pointage: this.typePointage() });
        // On relance le scan après un court délai pour permettre d'autres pointages.
        setTimeout(() => {
          this.boucleQrActive = true;
          this.boucleQr();
        }, 1500);
        return;
      }
    } catch {
      /* ignorer les erreurs transitoires du détecteur */
    }
    requestAnimationFrame(() => this.boucleQr());
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
    });
  }

  // --------- WebAuthn ---------
  async pointerWebauthn() {
    if (!this.matricule().trim()) {
      this.erreur.set('Saisissez le matricule de l\'agent pour l\'authentification biométrique.');
      return;
    }
    if (!this.webauthnSupporte()) {
      this.erreur.set('WebAuthn n\'est pas disponible sur cet appareil.');
      return;
    }
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const cred = (await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60_000,
          userVerification: 'required',
          rpId: window.location.hostname,
        },
      })) as PublicKeyCredential | null;
      if (!cred) {
        this.erreur.set('Authentification biométrique annulée.');
        return;
      }
      const resp = cred.response as AuthenticatorAssertionResponse;
      const payload = {
        matricule: this.matricule().trim(),
        type_pointage: this.typePointage(),
        webauthn: {
          id: cred.id,
          rawId: this.b64(cred.rawId),
          type: cred.type,
          clientDataJSON: this.b64(resp.clientDataJSON),
          authenticatorData: this.b64(resp.authenticatorData),
          signature: this.b64(resp.signature),
          userHandle: resp.userHandle ? this.b64(resp.userHandle) : null,
        },
      };
      // Le back doit exposer /pointage/webauthn ; sinon utiliser /pointage/facial
      // avec la preuve biométrique comme fallback logique.
      await this.envoyerPointage('facial', payload);
    } catch (e: any) {
      this.erreur.set(`Échec biométrique : ${e?.message ?? e}`);
    }
  }

  private b64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  // --------- Envoi commun ---------
  private async envoyerPointage(mode: 'qr' | 'facial', payload: Record<string, unknown>) {
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
    for (const s of [this.streamQr, this.streamFace]) {
      s?.getTracks().forEach((t) => t.stop());
    }
    this.streamQr = null;
    this.streamFace = null;
  }
}
