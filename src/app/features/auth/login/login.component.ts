import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, NgZone, inject, signal, viewChild } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Reflète en front la politique de mot de passe appliquée côté backend
 * (app/core/password_policy.py) : 12 caractères min, minuscule, majuscule,
 * chiffre, caractère spécial, pas d'espace en début/fin. Garder ces deux
 * politiques synchronisées si l'une des deux est modifiée.
 */
function politiqueMotDePasseValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const valeur: string = control.value ?? '';
    const erreurs: ValidationErrors = {};
    if (valeur.length < 12) erreurs['longueur'] = true;
    if (!/[a-z]/.test(valeur)) erreurs['minuscule'] = true;
    if (!/[A-Z]/.test(valeur)) erreurs['majuscule'] = true;
    if (!/\d/.test(valeur)) erreurs['chiffre'] = true;
    if (!/[^A-Za-z0-9]/.test(valeur)) erreurs['special'] = true;
    if (valeur !== valeur.trim()) erreurs['espaces'] = true;
    return Object.keys(erreurs).length > 0 ? erreurs : null;
  };
}

/**
 * Typage minimal de la partie de l'API Google Identity Services utilisée ici
 * (script chargé globalement dans index.html — pas de @types officiel léger).
 */
declare const google: {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }): void;
      renderButton(
        parent: HTMLElement,
        options: { theme?: string; size?: string; width?: number; text?: string; locale?: string }
      ): void;
    };
  };
};

type EtapeReinitialisation = 'demande' | 'code' | 'terminee';

@Component({
    selector: 'app-login',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss'
})
export class LoginComponent implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  private readonly googleButtonRef = viewChild<ElementRef<HTMLDivElement>>('googleButton');

  readonly enCours = signal(false);
  readonly erreur = signal<string | null>(null);

  readonly googleDisponible = signal(!!environment.googleClientId);
  readonly erreurGoogle = signal<string | null>(null);

  readonly modeReinitialisation = signal(false);
  readonly etapeReinitialisation = signal<EtapeReinitialisation>('demande');
  readonly messageReinitialisation = signal<string | null>(null);
  readonly erreurReinitialisation = signal<string | null>(null);

  readonly formulaire = this.fb.nonNullable.group({
    identifiant: ['', Validators.required],
    motDePasse: ['', Validators.required],
  });

  readonly formulaireReinitialisation = this.fb.nonNullable.group({
    identifiant: ['', Validators.required],
  });

  readonly formulaireCode = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
    nouveauMotDePasse: ['', [Validators.required, politiqueMotDePasseValidator()]],
    confirmationMotDePasse: ['', Validators.required],
  });

  /** Checklist affichée sous le champ "Nouveau mot de passe", mise à jour à chaque frappe. */
  get reglesMotDePasse(): { label: string; valide: boolean }[] {
    const valeur: string = this.formulaireCode.get('nouveauMotDePasse')?.value ?? '';
    return [
      { label: 'Au moins 12 caractères', valide: valeur.length >= 12 },
      { label: 'Une lettre minuscule', valide: /[a-z]/.test(valeur) },
      { label: 'Une lettre majuscule', valide: /[A-Z]/.test(valeur) },
      { label: 'Un chiffre', valide: /\d/.test(valeur) },
      { label: 'Un caractère spécial', valide: /[^A-Za-z0-9]/.test(valeur) },
    ];
  }

  get nombreReglesValidees(): number {
    return this.reglesMotDePasse.filter((r) => r.valide).length;
  }

  ngAfterViewInit(): void {
    if (!environment.googleClientId) {
      // Aucun GOOGLE_CLIENT_ID renseigné côté frontend : on garde le bouton
      // désactivé plutôt que d'appeler une API Google qui échouerait.
      return;
    }

    // Le script Google (index.html) charge `google` de façon asynchrone ;
    // on attend qu'il soit disponible avant d'initialiser.
    const initialiser = () => {
      const conteneur = this.googleButtonRef()?.nativeElement;
      if (typeof google === 'undefined' || !conteneur) {
        setTimeout(initialiser, 100);
        return;
      }
      try {
        google.accounts.id.initialize({
          client_id: environment.googleClientId,
          callback: (reponse) => this.zone.run(() => this.onGoogleCredential(reponse.credential)),
        });
        google.accounts.id.renderButton(conteneur, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
          locale: 'fr',
        });
      } catch {
        this.erreurGoogle.set("Impossible d'initialiser la connexion Google.");
      }
    };
    initialiser();
  }

  private onGoogleCredential(idToken: string): void {
    this.erreurGoogle.set(null);
    this.erreur.set(null);
    this.enCours.set(true);

    this.authService
      .loginGoogle(idToken)
      .pipe(finalize(() => this.enCours.set(false)))
      .subscribe({
        next: () => {
          this.authService.chargerProfil().subscribe({
            next: () => this.router.navigateByUrl('/'),
            error: () => this.erreurGoogle.set("Impossible de récupérer votre profil. Veuillez réessayer."),
          });
        },
        error: (err) => {
          this.erreurGoogle.set(
            err.status === 403
              ? "Aucun compte SRB n'est associé à cette adresse Google. Contactez l'administrateur."
              : err.status === 501
                ? "La connexion Google n'est pas configurée sur ce serveur."
                : 'Connexion Google impossible pour le moment. Réessayez plus tard.'
          );
        },
      });
  }

  seConnecter(): void {
    if (this.formulaire.invalid) {
      this.formulaire.markAllAsTouched();
      return;
    }

    const { identifiant, motDePasse } = this.formulaire.getRawValue();
    this.enCours.set(true);
    this.erreur.set(null);

    this.authService
      .login(identifiant, motDePasse)
      .pipe(finalize(() => this.enCours.set(false)))
      .subscribe({
        next: () => {
          this.authService.chargerProfil().subscribe({
            next: () => this.router.navigateByUrl('/'),
            error: () => this.erreur.set("Impossible de récupérer votre profil. Veuillez réessayer."),
          });
        },
        error: (err) => {
          this.erreur.set(
            err.status === 401
              ? 'Identifiant ou mot de passe incorrect.'
              : "Connexion impossible pour le moment. Vérifiez votre réseau ou réessayez plus tard."
          );
        },
      });
  }

  basculerReinitialisation(afficher: boolean): void {
    this.modeReinitialisation.set(afficher);
    this.etapeReinitialisation.set('demande');
    this.messageReinitialisation.set(null);
    this.erreurReinitialisation.set(null);
    this.formulaireReinitialisation.reset();
    this.formulaireCode.reset();
  }

  demanderReinitialisation(): void {
    if (this.formulaireReinitialisation.invalid) {
      this.formulaireReinitialisation.markAllAsTouched();
      return;
    }
    const { identifiant } = this.formulaireReinitialisation.getRawValue();
    this.enCours.set(true);
    this.authService
      .demanderReinitialisation(identifiant)
      .pipe(finalize(() => this.enCours.set(false)))
      .subscribe({
        next: (res) => {
          this.messageReinitialisation.set(res.message);
          // Le message est volontairement générique côté serveur (anti-énumération) :
          // on passe systématiquement à l'étape de saisie du code.
          this.etapeReinitialisation.set('code');
        },
        error: () => {
          // Même en cas d'erreur réseau inattendue, on ne révèle rien de plus :
          // on affiche le même message générique et on avance à l'étape suivante.
          this.messageReinitialisation.set(
            "Si un compte existe avec cet identifiant, un code de réinitialisation vient de lui être envoyé par e-mail."
          );
          this.etapeReinitialisation.set('code');
        },
      });
  }

  validerCode(): void {
    if (this.formulaireCode.invalid) {
      this.formulaireCode.markAllAsTouched();
      return;
    }
    const { code, nouveauMotDePasse, confirmationMotDePasse } = this.formulaireCode.getRawValue();
    this.erreurReinitialisation.set(null);

    if (nouveauMotDePasse !== confirmationMotDePasse) {
      this.erreurReinitialisation.set('Les deux mots de passe ne correspondent pas.');
      return;
    }

    const { identifiant } = this.formulaireReinitialisation.getRawValue();
    this.enCours.set(true);
    this.authService
      .reinitialiserMotDePasse(identifiant, code, nouveauMotDePasse)
      .pipe(finalize(() => this.enCours.set(false)))
      .subscribe({
        next: () => {
          this.etapeReinitialisation.set('terminee');
        },
        error: (err) => {
          if (err.status === 422 && typeof err.error?.detail === 'string') {
            // Le backend renvoie le détail exact de la politique de mot de
            // passe non respectée (app/core/password_policy.py) : on l'affiche
            // tel quel plutôt qu'un message générique.
            this.erreurReinitialisation.set(err.error.detail);
          } else if (err.status === 400) {
            this.erreurReinitialisation.set(
              'Code invalide, expiré, ou identifiant incorrect. Vérifiez votre e-mail ou redemandez un code.'
            );
          } else {
            this.erreurReinitialisation.set('Réinitialisation impossible pour le moment. Réessayez plus tard.');
          }
        },
      });
  }
}
