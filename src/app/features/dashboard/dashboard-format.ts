/**
 * Constantes de présentation et helpers de dates du tableau de bord.
 * Extrait de `dashboard.component.ts` pour respecter la limite de 500 lignes
 * par fichier.
 */
import { TypePeriode } from '../../core/models/bi.model';

export const GRIS_GRILLE = '#EEF0F2';
export const PALETTE_SERVICES = ['#0F6E56', '#185FA5', '#BA7517', '#534AB7', '#D85A30', '#0F3D5C'];

export const LIBELLE_PERIODE: Record<TypePeriode, string> = {
  jour: 'Jour',
  semaine: 'Semaine',
  mois: 'Mois',
  annee: 'Année',
};

export const LIBELLE_FENETRE_TENDANCE: Record<TypePeriode, string> = {
  jour: '30 derniers jours',
  semaine: '12 dernières semaines',
  mois: '12 derniers mois',
  annee: '5 dernières années',
};

/**
 * Profondeur d'historique demandée au modèle prédictif selon la granularité.
 * Le backend l'élargit automatiquement si trop de périodes sont vides et la
 * plafonne si elle est trop large : ces valeurs sont un point de départ
 * cohérent avec la fenêtre affichée, pas une contrainte rigide.
 */
export const HISTORIQUE_PREVISION: Record<TypePeriode, number> = {
  jour: 24,
  semaine: 12,
  mois: 12,
  annee: 5,
};

export const LIBELLE_PERIODE_COURANTE: Record<TypePeriode, string> = {
  jour: 'ce jour',
  semaine: 'cette semaine',
  mois: 'ce mois-ci',
  annee: 'cette année',
};

/**
 * Sérialise une date en ISO (AAAA-MM-JJ) d'après ses composantes LOCALES.
 *
 * `date.toISOString()` convertit d'abord en UTC : pour un fuseau horaire en
 * avance sur UTC (ex. Madagascar, UTC+3), les heures entre 00h00 et 03h00
 * locales tombent encore sur la veille en UTC, ce qui envoyait au backend
 * la mauvaise date pour "aujourd'hui" (jour du tableau de bord temps réel,
 * bornes de période, fenêtre de tendance...) — d'où, entre autres, la liste
 * "Agents en retard aujourd'hui" qui pouvait rester vide alors que des
 * retards existaient bien pour la date locale réelle.
 */
export function formatDateISO(date: Date): string {
  const annee = date.getFullYear();
  const mois = `${date.getMonth() + 1}`.padStart(2, '0');
  const jour = `${date.getDate()}`.padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

export function formatDateCourte(iso: string, granularite: TypePeriode = 'jour'): string {
  const [annee, mois, jour] = iso.split('-');
  switch (granularite) {
    case 'annee':
      return annee;
    case 'mois':
      return `${mois}/${annee.slice(2)}`;
    default:
      return `${jour}/${mois}`;
  }
}

export function formatDateAffichage(iso: string): string {
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
}

export function debutDeJournee(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function lundiDeSemaine(date: Date): Date {
  const d = debutDeJournee(date);
  const decalage = (d.getDay() + 6) % 7; // 0 = lundi ... 6 = dimanche
  d.setDate(d.getDate() - decalage);
  return d;
}

/**
 * Décale une date de `delta` mois sans le débordement de `Date.setMonth()`.
 *
 * `new Date(2025, 2, 31).setMonth(1)` bascule sur le 3 mars (février n'a pas
 * de 31) : la fenêtre « 12 derniers mois » sautait donc un mois dès que la
 * date de référence tombait le 29, 30 ou 31. On borne ici le jour au dernier
 * jour du mois cible.
 */
export function ajouterMois(date: Date, delta: number): Date {
  const d = debutDeJournee(date);
  const cible = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  const dernierJourCible = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate();
  cible.setDate(Math.min(d.getDate(), dernierJourCible));
  return cible;
}

/** Premier jour du mois d'une date. */
export function premierJourDuMois(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Dernier jour du mois d'une date. */
export function dernierJourDuMois(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** Bornes de la période sélectionnée — même convention que `bornes_periode` côté backend. */
export function bornesPeriode(periode: TypePeriode, reference: Date): { debut: Date; fin: Date } {
  const ref = debutDeJournee(reference);
  switch (periode) {
    case 'jour':
      return { debut: ref, fin: ref };
    case 'semaine': {
      const debut = lundiDeSemaine(ref);
      const fin = new Date(debut);
      fin.setDate(fin.getDate() + 6);
      return { debut, fin };
    }
    case 'mois': {
      const debut = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      return { debut, fin };
    }
    case 'annee':
    default: {
      const debut = new Date(ref.getFullYear(), 0, 1);
      const fin = new Date(ref.getFullYear(), 11, 31);
      return { debut, fin };
    }
  }
}

/** Fenêtre glissante affichée sur les graphiques de tendance/prévision, avec la granularité assortie. */
export function fenetreTendance(periode: TypePeriode, reference: Date): { debut: Date; fin: Date; granularite: TypePeriode } {
  const ref = debutDeJournee(reference);
  switch (periode) {
    case 'jour': {
      const debut = new Date(ref);
      debut.setDate(debut.getDate() - 29);
      return { debut, fin: ref, granularite: periode };
    }
    case 'semaine': {
      const debut = lundiDeSemaine(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 7 * 11));
      return { debut, fin: ref, granularite: periode };
    }
    case 'mois': {
      // Fenêtre alignée sur des mois complets : on part du 1er du mois situé
      // 11 mois avant le mois de référence (sans débordement de calendrier),
      // pour obtenir exactement 12 points mensuels.
      const debut = premierJourDuMois(ajouterMois(ref, -11));
      return { debut, fin: ref, granularite: periode };
    }
    case 'annee':
    default: {
      const debut = new Date(ref.getFullYear() - 4, 0, 1);
      return { debut, fin: ref, granularite: 'annee' };
    }
  }
}
