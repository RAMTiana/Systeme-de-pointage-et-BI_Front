import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

import { PointageScanComponent } from '../pointage-scan/pointage-scan.component';

/**
 * Poste de pointage public (kiosque).
 *
 * Page volontairement HORS du shell authentifié (pas d'`authGuard`, pas de menu,
 * pas d'historique ni de données RH) : elle n'expose que le strict nécessaire pour
 * qu'un agent scanne lui-même son entrée/sortie (QR, badge, facial ou biométrie
 * WebAuthn de l'appareil).
 *
 * Objectif métier : jusqu'ici, `/pointage` (onglet « Poste de scan ») était derrière
 * la connexion staff (Chef de service / Secrétaire / Administrateur) — un seul poste
 * validé par une session ouverte, donc une seule file d'attente. Cette page peut être
 * ouverte sur n'importe quel nombre d'appareils/tablettes du bureau (aucune session à
 * ouvrir), afin que plusieurs agents pointent en parallèle et qu'il n'y ait plus de queue.
 *
 * Sécurité : l'authentification de ce poste se fait déjà côté API via l'en-tête
 * `X-Device-Key` (cf. `PointageScanComponent` / `app.api.deps.verify_device_key`),
 * pas par un compte utilisateur — voir commentaire dans `environment.ts`. Cette page
 * ne fait qu'exposer ce mécanisme existant sans exiger de JWT. Elle ne doit être
 * déployée que sur le réseau interne du bureau (pas de restriction technique
 * supplémentaire ajoutée côté application, à gérer au niveau réseau/reverse proxy).
 */
@Component({
  selector: 'app-pointage-kiosk',
  standalone: true,
  imports: [CommonModule, PointageScanComponent],
  templateUrl: './pointage-kiosk.component.html',
  styleUrl: './pointage-kiosk.component.scss',
})
export class PointageKioskComponent {}
