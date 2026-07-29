import { Injectable, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ThemeEffectif = 'light' | 'dark';

const CLE_STOCKAGE = 'srb-theme';

/**
 * Gère le thème clair/sombre de l'application.
 *
 * Normes UI/UX suivies :
 * - respecte par défaut la préférence système (`prefers-color-scheme`) ;
 * - permet à la personne de forcer un thème, mémorisé dans localStorage
 *   afin de rester cohérent d'une session à l'autre ;
 * - réagit en direct si le thème du système change (et qu'aucun choix
 *   explicite n'a été fait) ;
 * - applique le thème via l'attribut `data-theme` sur <html>, déjà
 *   positionné avant le bootstrap Angular (voir script dans index.html)
 *   pour éviter tout flash de contenu non stylé (FOUC).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  /** Préférence choisie par la personne : 'light' | 'dark' | 'system'. */
  readonly preference = signal<ThemePreference>(this.lirePreferenceStockee());

  /** Thème réellement appliqué à l'écran ('light' | 'dark'). */
  readonly themeEffectif = signal<ThemeEffectif>(this.calculerThemeEffectif(this.preference()));

  constructor() {
    this.appliquerAuDom(this.themeEffectif());

    this.media.addEventListener('change', () => {
      if (this.preference() === 'system') {
        this.themeEffectif.set(this.calculerThemeEffectif('system'));
        this.appliquerAuDom(this.themeEffectif());
      }
    });
  }

  /** Bascule simplement entre clair et sombre (utilisé par le bouton de la barre latérale). */
  basculer(): void {
    const nouveau: ThemePreference = this.themeEffectif() === 'dark' ? 'light' : 'dark';
    this.definirPreference(nouveau);
  }

  /** Permet de fixer explicitement une préférence, y compris revenir au réglage système. */
  definirPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    this.themeEffectif.set(this.calculerThemeEffectif(preference));
    this.appliquerAuDom(this.themeEffectif());

    if (preference === 'system') {
      localStorage.removeItem(CLE_STOCKAGE);
    } else {
      localStorage.setItem(CLE_STOCKAGE, preference);
    }
  }

  private lirePreferenceStockee(): ThemePreference {
    const stocke = localStorage.getItem(CLE_STOCKAGE);
    return stocke === 'light' || stocke === 'dark' ? stocke : 'system';
  }

  private calculerThemeEffectif(preference: ThemePreference): ThemeEffectif {
    if (preference === 'system') {
      return this.media.matches ? 'dark' : 'light';
    }
    return preference;
  }

  private appliquerAuDom(theme: ThemeEffectif): void {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
