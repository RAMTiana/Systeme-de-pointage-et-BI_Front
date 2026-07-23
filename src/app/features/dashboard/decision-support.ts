/**
 * Système d'aide à la décision — moteur de règles.
 *
 * Ne recalcule rien côté serveur : il applique des seuils métier sur les
 * données déjà renvoyées par le module BI (`/bi/temps-reel`, `/bi/tendances`,
 * `/bi/comparaison-services`, `/bi/classement`, `/bi/prevision`) pour
 * transformer des indicateurs bruts en recommandations actionnables,
 * conformément au besoin du cahier des charges "Système d'aide à la
 * décision (BI)".
 *
 * Les seuils sont volontairement isolés en constantes en tête de fichier :
 * ce sont les seuls réglages à ajuster si la politique de présence change.
 */
import {
  ClassementAgentOut,
  ComparaisonServicesOut,
  PointTendance,
  PrevisionOut,
  TableauBordTempsReel,
} from '../../core/models/bi.model';
 
export type NiveauRecommandation = 'critique' | 'attention' | 'positif' | 'info';
 
export interface Recommandation {
  id: string;
  niveau: NiveauRecommandation;
  icone: string;
  titre: string;
  description: string;
  action: string;
}
 
// ---- Seuils métier ----
const SEUIL_PRESENCE_CRITIQUE = 0.8;
const SEUIL_PRESENCE_ATTENTION = 0.9;
const SEUIL_RETARDS_JOUR = 0.15; // part des agents attendus en retard, un jour donné
const SEUIL_ECART_TENDANCE = 3; // points de %, sur la fenêtre observée
const SEUIL_ECART_PREVISION = 3; // points de %, entre dernier historique et dernière prévision
 
const PCT = (v: number | null | undefined): string => (v === null || v === undefined ? 'n/d' : `${(v * 100).toFixed(1)} %`);
 
function poidsNiveau(niveau: NiveauRecommandation): number {
  return { critique: 0, attention: 1, positif: 2, info: 3 }[niveau];
}
 
export function calculerRecommandations(donnees: {
  tempsReel: TableauBordTempsReel | null;
  tendances: PointTendance[];
  comparaison: ComparaisonServicesOut | null;
  classement: ClassementAgentOut[];
  prevision: PrevisionOut | null;
}): Recommandation[] {
  const recommandations: Recommandation[] = [];
  const { tempsReel, tendances, comparaison, classement, prevision } = donnees;
 
  // 1. Taux de présence du jour
  if (tempsReel && tempsReel.taux_presence !== null) {
    if (tempsReel.taux_presence < SEUIL_PRESENCE_CRITIQUE) {
      recommandations.push({
        id: 'presence-jour-critique',
        niveau: 'critique',
        icone: 'ti-alert-triangle',
        titre: 'Taux de présence du jour préoccupant',
        description: `Le taux de présence observé aujourd'hui (${PCT(tempsReel.taux_presence)}) est nettement sous le seuil attendu (${PCT(SEUIL_PRESENCE_CRITIQUE)}).`,
        action: "Vérifier les motifs d'absence du jour et alerter les responsables de division concernés.",
      });
    } else if (tempsReel.taux_presence < SEUIL_PRESENCE_ATTENTION) {
      recommandations.push({
        id: 'presence-jour-attention',
        niveau: 'attention',
        icone: 'ti-alert-circle',
        titre: 'Taux de présence du jour sous l\u2019objectif',
        description: `Le taux de présence du jour (${PCT(tempsReel.taux_presence)}) reste en dessous de l'objectif de ${PCT(SEUIL_PRESENCE_ATTENTION)}.`,
        action: 'Surveiller les prochains jours pour confirmer ou écarter une tendance durable.',
      });
    }
  }
 
  // 2. Pic de retards du jour
  if (tempsReel && tempsReel.nombre_agents_attendus > 0) {
    const partRetards = tempsReel.nombre_retardataires / tempsReel.nombre_agents_attendus;
    if (partRetards >= SEUIL_RETARDS_JOUR) {
      recommandations.push({
        id: 'retards-jour',
        niveau: 'attention',
        icone: 'ti-clock-exclamation',
        titre: 'Pic de retards détecté aujourd\u2019hui',
        description: `${tempsReel.nombre_retardataires} agent(s) en retard sur ${tempsReel.nombre_agents_attendus} attendus (${PCT(partRetards)}).`,
        action: "Identifier si le pic est localisé à une division (transport, horaire d'ouverture) ou généralisé.",
      });
    }
  }
 
  // 3. Tendance sur la période observée (30 jours par défaut côté dashboard)
  const pointsValides = tendances.filter((p) => p.globaux.taux_presence !== null);
  if (pointsValides.length >= 2) {
    const premier = pointsValides[0].globaux.taux_presence as number;
    const dernier = pointsValides[pointsValides.length - 1].globaux.taux_presence as number;
    const ecartPoints = (dernier - premier) * 100;
    if (ecartPoints <= -SEUIL_ECART_TENDANCE) {
      recommandations.push({
        id: 'tendance-baisse',
        niveau: 'attention',
        icone: 'ti-trending-down',
        titre: 'Tendance à la baisse sur la période observée',
        description: `Le taux de présence est passé de ${PCT(premier)} à ${PCT(dernier)} sur la fenêtre affichée (${ecartPoints.toFixed(1)} pt).`,
        action: 'Croiser avec le calendrier (jours fériés, congés groupés) avant de conclure à un problème structurel.',
      });
    } else if (ecartPoints >= SEUIL_ECART_TENDANCE) {
      recommandations.push({
        id: 'tendance-hausse',
        niveau: 'positif',
        icone: 'ti-trending-up',
        titre: 'Amélioration continue de la présence',
        description: `Le taux de présence progresse de ${PCT(premier)} à ${PCT(dernier)} sur la fenêtre affichée (+${ecartPoints.toFixed(1)} pt).`,
        action: 'Documenter les actions récentes qui pourraient expliquer cette amélioration pour les généraliser.',
      });
    }
  }
 
  // 4. Comparaison entre divisions (repérer la division en difficulté et la division exemplaire)
  const servicesValides = (comparaison?.services ?? []).filter((s) => s.taux_presence !== null);
  if (servicesValides.length >= 2) {
    const pire = [...servicesValides].sort((a, b) => (a.taux_presence as number) - (b.taux_presence as number))[0];
    const meilleur = [...servicesValides].sort((a, b) => (b.taux_presence as number) - (a.taux_presence as number))[0];
 
    if ((pire.taux_presence as number) < SEUIL_PRESENCE_CRITIQUE) {
      recommandations.push({
        id: 'service-difficulte',
        niveau: 'critique',
        icone: 'ti-building-warehouse',
        titre: `Division en difficulté : ${pire.nom_service}`,
        description: `Taux de présence de ${PCT(pire.taux_presence)} sur la période, nettement en retrait des autres divisions.`,
        action: 'Planifier un point avec le responsable de la division pour comprendre les causes (organisation, effectifs, horaires).',
      });
    }
    if (meilleur.id_service !== pire.id_service && (meilleur.taux_presence as number) >= SEUIL_PRESENCE_ATTENTION) {
      recommandations.push({
        id: 'service-exemplaire',
        niveau: 'positif',
        icone: 'ti-medal',
        titre: `Division exemplaire : ${meilleur.nom_service}`,
        description: `Taux de présence de ${PCT(meilleur.taux_presence)} sur la période, le meilleur parmi les divisions comparées.`,
        action: 'Identifier les bonnes pratiques de cette division pour les partager aux autres divisions.',
      });
    }
  }
 
  // 5. Agent le plus ponctuel du classement (valorisation positive)
  if (classement.length > 0 && classement[0].nombre_retards === 0) {
    const agent = classement[0];
    recommandations.push({
      id: 'agent-exemplaire',
      niveau: 'positif',
      icone: 'ti-star',
      titre: 'Ponctualité exemplaire',
      description: `${agent.prenom} ${agent.nom} (${agent.nom_service}) n'a enregistré aucun retard sur la période.`,
      action: "Une reconnaissance formelle peut renforcer l'exemplarité au sein de la division.",
    });
  }
 
  // 6. Signal prédictif
  if (prevision && prevision.historique.length && prevision.prevision.length) {
    const dernierHisto = prevision.historique[prevision.historique.length - 1].globaux.taux_presence;
    const dernierePrevision = prevision.prevision[prevision.prevision.length - 1].taux_presence_estime;
    if (dernierHisto !== null && dernierePrevision !== null) {
      const ecart = (dernierePrevision - dernierHisto) * 100;
      if (ecart <= -SEUIL_ECART_PREVISION) {
        recommandations.push({
          id: 'prevision-baisse',
          niveau: 'attention',
          icone: 'ti-chart-line',
          titre: 'Le modèle prédictif anticipe une baisse',
          description: `Projection à ${PCT(dernierePrevision)} contre ${PCT(dernierHisto)} actuellement (méthode : ${prevision.methode}).`,
          action: 'Anticiper une action corrective avant la prochaine période plutôt que de la constater a posteriori.',
        });
      }
    }
  }
 
  if (recommandations.length === 0) {
    recommandations.push({
      id: 'rien-a-signaler',
      niveau: 'info',
      icone: 'ti-shield-check',
      titre: 'Aucune alerte sur le périmètre sélectionné',
      description: 'Les indicateurs de présence, de ponctualité et de tendance sont conformes aux seuils définis.',
      action: 'Aucune action requise pour le moment.',
    });
  }
 
  return recommandations.sort((a, b) => poidsNiveau(a.niveau) - poidsNiveau(b.niveau));
}
 