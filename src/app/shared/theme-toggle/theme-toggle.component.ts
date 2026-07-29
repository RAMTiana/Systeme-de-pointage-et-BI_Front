import { Component } from '@angular/core';

import { ThemeService } from '../../core/services/theme.service';

/**
 * Bouton flottant de bascule clair/sombre, ancré en haut à droite de
 * l'écran (visible sur toutes les pages, y compris l'écran de connexion).
 *
 * Ergonomie / accessibilité :
 * - `role="switch"` + `aria-checked` reflètent l'état réel du thème ;
 * - `aria-label` explicite pour les lecteurs d'écran (icône seule = insuffisant) ;
 * - zone cliquable de 44×44px minimum (WCAG 2.5.5 — cible tactile) ;
 * - activable au clavier comme tout <button>, focus visible géré globalement ;
 * - `z-index` choisi pour rester au-dessus du contenu sans jamais recouvrir
 *   l'assistant IA (flottant en bas à droite) ni les modales.
 */
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `
    <button
      type="button"
      class="theme-toggle-fab"
      role="switch"
      [attr.aria-checked]="themeService.themeEffectif() === 'dark'"
      [attr.aria-label]="
        themeService.themeEffectif() === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'
      "
      [title]="themeService.themeEffectif() === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'"
      (click)="themeService.basculer()"
    >
      <i class="ti" [class.ti-sun]="themeService.themeEffectif() === 'dark'" [class.ti-moon]="themeService.themeEffectif() === 'light'"></i>
    </button>
  `,
  styles: [
    `
      :host {
        position: fixed;
        top: 18px;
        right: 20px;
        z-index: 1010;
      }

      .theme-toggle-fab {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--srb-blue-ink);
        box-shadow: var(--shadow);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 19px;
        cursor: pointer;
        transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
      }

      .theme-toggle-fab:hover {
        background: var(--info-light);
        color: var(--info-ink);
        transform: translateY(-1px);
      }

      @media (max-width: 560px) {
        :host {
          top: 12px;
          right: 12px;
        }
        .theme-toggle-fab {
          width: 40px;
          height: 40px;
          font-size: 17px;
        }
      }
    `,
  ],
})
export class ThemeToggleComponent {
  constructor(readonly themeService: ThemeService) {}
}
