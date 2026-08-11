import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';

/** Côté client (avant envoi) : dimension et qualité cible pour que la photo
 * de profil reste légère, quel que soit le fichier d'origine choisi. */
const TAILLE_CIBLE_PX = 320;
const QUALITE_JPEG = 0.85;
const TAILLE_MAX_FICHIER_OCTETS = 8 * 1024 * 1024; // 8 Mo en entrée, avant compression

@Component({
  selector: 'app-profil',
  imports: [CommonModule, FormsModule],
  templateUrl: './profil.component.html',
  styleUrl: './profil.component.scss',
})
export class ProfilComponent {
  private readonly auth = inject(AuthService);

  @ViewChild('champFichier') champFichier?: ElementRef<HTMLInputElement>;

  readonly utilisateur = this.auth.utilisateur;

  nomComplet = this.utilisateur()?.nom_complet ?? '';
  /** Aperçu affiché : photo nouvellement choisie, sinon celle déjà enregistrée. */
  readonly apercuPhoto = signal<string | null | undefined>(this.utilisateur()?.photo_profil);
  photoModifiee = false;

  readonly enregistrementEnCours = signal(false);
  readonly erreur = signal<string | null>(null);
  readonly messageSucces = signal<string | null>(null);

  readonly initiales = computed(() => {
    const nom = this.utilisateur()?.nom_complet ?? '';
    return nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((mot) => mot[0]?.toUpperCase())
      .join('');
  });

  declencherSelectionFichier(): void {
    this.champFichier?.nativeElement.click();
  }

  surChangementFichier(evenement: Event): void {
    const fichier = (evenement.target as HTMLInputElement).files?.[0];
    if (!fichier) return;

    this.erreur.set(null);

    if (!fichier.type.startsWith('image/')) {
      this.erreur.set('Le fichier choisi n’est pas une image.');
      return;
    }
    if (fichier.size > TAILLE_MAX_FICHIER_OCTETS) {
      this.erreur.set('Image trop volumineuse (8 Mo maximum).');
      return;
    }

    const lecteur = new FileReader();
    lecteur.onload = () => this.redimensionnerEtApercevoir(lecteur.result as string);
    lecteur.onerror = () => this.erreur.set('Impossible de lire ce fichier.');
    lecteur.readAsDataURL(fichier);
  }

  /** Redimensionne côté client (canvas) vers un carré ~320px et recompresse en
   * JPEG : garde la photo bien sous la limite de 2 Mo imposée par l'API,
   * quelle que soit la résolution d'origine du fichier choisi. */
  private redimensionnerEtApercevoir(dataUrlOriginale: string): void {
    const image = new Image();
    image.onload = () => {
      const cote = Math.min(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = TAILLE_CIBLE_PX;
      canvas.height = TAILLE_CIBLE_PX;
      const contexte = canvas.getContext('2d');
      if (!contexte) {
        this.erreur.set('Impossible de traiter cette image dans ce navigateur.');
        return;
      }
      // Recadrage centré en carré, puis redimensionnement à la taille cible.
      const decalageX = (image.width - cote) / 2;
      const decalageY = (image.height - cote) / 2;
      contexte.drawImage(image, decalageX, decalageY, cote, cote, 0, 0, TAILLE_CIBLE_PX, TAILLE_CIBLE_PX);

      const dataUrlCompressee = canvas.toDataURL('image/jpeg', QUALITE_JPEG);
      this.apercuPhoto.set(dataUrlCompressee);
      this.photoModifiee = true;
    };
    image.onerror = () => this.erreur.set('Impossible de traiter cette image.');
    image.src = dataUrlOriginale;
  }

  supprimerPhoto(): void {
    this.apercuPhoto.set(null);
    this.photoModifiee = true;
    if (this.champFichier) {
      this.champFichier.nativeElement.value = '';
    }
  }

  enregistrer(): void {
    if (!this.nomComplet.trim()) {
      this.erreur.set('Le nom complet ne peut pas être vide.');
      return;
    }

    this.erreur.set(null);
    this.messageSucces.set(null);
    this.enregistrementEnCours.set(true);

    const payload: { nom_complet?: string; photo_profil?: string } = {
      nom_complet: this.nomComplet.trim(),
    };
    if (this.photoModifiee) {
      payload.photo_profil = this.apercuPhoto() ?? '';
    }

    this.auth
      .modifierMonProfil(payload)
      .pipe(finalize(() => this.enregistrementEnCours.set(false)))
      .subscribe({
        next: () => {
          this.photoModifiee = false;
          this.messageSucces.set('Profil mis à jour.');
        },
        error: (err) => this.erreur.set(this.extraireMessageErreur(err)),
      });
  }

  /** L'API renvoie `detail` en chaîne (règle métier) ou en liste d'erreurs de
   * validation Pydantic (422) : on affiche un message exploitable dans les deux cas. */
  private extraireMessageErreur(err: any): string {
    const detail = err?.error?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    return 'Impossible d’enregistrer le profil. Vérifiez les champs saisis.';
  }
}
