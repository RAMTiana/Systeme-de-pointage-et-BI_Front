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
  AnomalieAgentScoreOut,
  ClassementAgentOut,
  ComparaisonServicesOut,
  PointTendance,
  PrevisionOut,
  ScoreRisqueAgentOut,
  TableauBordTempsReel,
} from '../../core/models/bi.model';
import { AnomalieDetailOut } from '../../core/models/anomalie.model';

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
const SEUIL_RISQUE_ELEVE = 0.6; // score de risque ML (0-1) à partir duquel un agent est signalé
const NB_MAX_AGENTS_SIGNALES = 3; // nombre d'agents cités nommément par recommandation ML
const SEUIL_RETARDS_CONSECUTIFS = 3; // nombre de jours ouvrés consécutifs de retard déclenchant l'avertissement
const SEUIL_ABSENCES_CONSECUTIVES = 2; // nombre de jours ouvrés consécutifs d'absence déclenchant l'avertissement

const PCT = (v: number | null | undefined): string => (v === null || v === undefined ? 'n/d' : `${(v * 100).toFixed(1)} %`);

function poidsNiveau(niveau: NiveauRecommandation): number {
  return { critique: 0, attention: 1, positif: 2, info: 3 }[niveau];
}

/** Nombre de jours ouvrés (hors week-end) entre deux dates ISO consécutives dans une série triée. */
function estJourOuvreSuivant(dateIsoPrecedente: string, dateIsoCourante: string): boolean {
  const precedente = new Date(`${dateIsoPrecedente}T00:00:00`);
  const courante = new Date(`${dateIsoCourante}T00:00:00`);
  const ecartJours = Math.round((courante.getTime() - precedente.getTime()) / (24 * 60 * 60 * 1000));
  if (ecartJours === 1) return true;
  // Vendredi (5) -> lundi suivant : 3 jours calendaires d'écart, mais 1 jour ouvré.
  return ecartJours === 3 && precedente.getDay() === 5;
}

interface AgentAnomalieConsecutive {
  id_agent: number;
  nom: string;
  service: string;
  nombreJours: number;
  derniereDate: string;
}

/**
 * Repère, parmi une liste d'anomalies d'un même type (retard ou absence) sur
 * la semaine en cours, les agents ayant enregistré cette anomalie au moins
 * `seuilJours` jours ouvrés d'affilée (ex. lundi, mardi, mercredi).
 * Fonction générique réutilisée pour la règle 9 (retards répétés) et la
 * règle 10 (absences répétées) du moteur de recommandations.
 */
function detecterAnomaliesConsecutives(
  anomaliesSemaine: AnomalieDetailOut[],
  seuilJours: number
): AgentAnomalieConsecutive[] {
  const parAgent = new Map<number, { dates: Set<string>; nom: string; service: string }>();

  for (const anomalie of anomaliesSemaine) {
    const dateIso = anomalie.date_detection.slice(0, 10);
    let entree = parAgent.get(anomalie.id_agent);
    if (!entree) {
      const agent = anomalie.agent;
      entree = {
        dates: new Set(),
        nom: agent ? `${agent.prenom} ${agent.nom}` : `Agent #${anomalie.id_agent}`,
        service: agent?.service?.nom_service ?? 'Division non renseignée',
      };
      parAgent.set(anomalie.id_agent, entree);
    }
    entree.dates.add(dateIso);
  }

  const resultats: AgentAnomalieConsecutive[] = [];
  for (const [idAgent, { dates, nom, service }] of parAgent) {
    const datesTriees = [...dates].sort();
    let streak = 1;
    let meilleureStreak = 1;
    let derniereDateStreak = datesTriees[0];
    for (let i = 1; i < datesTriees.length; i++) {
      if (estJourOuvreSuivant(datesTriees[i - 1], datesTriees[i])) {
        streak += 1;
      } else {
        streak = 1;
      }
      if (streak > meilleureStreak) {
        meilleureStreak = streak;
        derniereDateStreak = datesTriees[i];
      }
    }
    if (meilleureStreak >= seuilJours) {
      resultats.push({ id_agent: idAgent, nom, service, nombreJours: meilleureStreak, derniereDate: derniereDateStreak });
    }
  }

  return resultats.sort((a, b) => b.nombreJours - a.nombreJours);
}

export function calculerRecommandations(donnees: {
  tempsReel: TableauBordTempsReel | null;
  tendances: PointTendance[];
  comparaison: ComparaisonServicesOut | null;
  classement: ClassementAgentOut[];
  prevision: PrevisionOut | null;
  // Champs ML optionnels : la fonction reste utilisable telle quelle si
  // l'appelant ne consulte pas (encore) ces nouveaux endpoints.
  anomaliesMl?: AnomalieAgentScoreOut[];
  scoresRisque?: ScoreRisqueAgentOut[];
  // Anomalies de type "retard" détectées depuis le lundi de la semaine en
  // cours jusqu'à aujourd'hui — sert uniquement à repérer les retards
  // répétés plusieurs jours ouvrés d'affilée (cf. règle 9 ci-dessous).
  anomaliesRetardSemaine?: AnomalieDetailOut[];
  // Idem pour les anomalies de type "absence" — sert à la règle 10
  // (absences répétées) ci-dessous.
  anomaliesAbsenceSemaine?: AnomalieDetailOut[];
}): Recommandation[] {
  const recommandations: Recommandation[] = [];
  const {
    tempsReel,
    tendances,
    comparaison,
    classement,
    prevision,
    anomaliesMl,
    scoresRisque,
    anomaliesRetardSemaine,
    anomaliesAbsenceSemaine,
  } = donnees;

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
        action: "Identifier si le pic est localisé à un division (transport, horaire d'ouverture) ou généralisé.",
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

  // 4. Comparaison entre services (repérer le service en difficulté et le service exemplaire)
  const servicesValides = (comparaison?.services ?? []).filter((s) => s.taux_presence !== null);
  if (servicesValides.length >= 2) {
    const pire = [...servicesValides].sort((a, b) => (a.taux_presence as number) - (b.taux_presence as number))[0];
    const meilleur = [...servicesValides].sort((a, b) => (b.taux_presence as number) - (a.taux_presence as number))[0];

    if ((pire.taux_presence as number) < SEUIL_PRESENCE_CRITIQUE) {
      recommandations.push({
        id: 'service-difficulte',
        niveau: 'critique',
        icone: 'ti-building-warehouse',
        titre: `Service en difficulté : ${pire.nom_service}`,
        description: `Taux de présence de ${PCT(pire.taux_presence)} sur la période, nettement en retrait des autres divisions.`,
        action: 'Planifier un point avec le responsable du division pour comprendre les causes (organisation, effectifs, horaires).',
      });
    }
    if (meilleur.id_service !== pire.id_service && (meilleur.taux_presence as number) >= SEUIL_PRESENCE_ATTENTION) {
      recommandations.push({
        id: 'service-exemplaire',
        niveau: 'positif',
        icone: 'ti-medal',
        titre: `Service exemplaire : ${meilleur.nom_service}`,
        description: `Taux de présence de ${PCT(meilleur.taux_presence)} sur la période, le meilleur parmi les divisions comparés.`,
        action: 'Identifier les bonnes pratiques de ce division pour les partager aux autres divisions.',
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
      action: "Une reconnaissance formelle peut renforcer l'exemplarité au sein du division.",
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

  // 7. Agents à risque élevé (score prédictif machine learning)
  if (scoresRisque && scoresRisque.length > 0) {
    const agentsARisque = scoresRisque.filter((a) => a.score_risque >= SEUIL_RISQUE_ELEVE);
    if (agentsARisque.length > 0) {
      const cites = agentsARisque.slice(0, NB_MAX_AGENTS_SIGNALES);
      const noms = cites.map((a) => `${a.prenom} ${a.nom} (${Math.round(a.score_risque * 100)} %)`).join(', ');
      const complement = agentsARisque.length > cites.length ? ` et ${agentsARisque.length - cites.length} autre(s)` : '';
      recommandations.push({
        id: 'agents-risque-eleve',
        niveau: 'attention',
        icone: 'ti-alert-hexagon',
        titre: 'Agents à risque élevé de retard ou d\u2019absence',
        description: `Le modèle prédictif estime un risque élevé pour : ${noms}${complement} sur la période à venir (méthode : ${cites[0].methode}).`,
        action: 'Anticiper un point individuel avec ces agents avant que la situation ne se traduise par une anomalie constatée.',
      });
    }
  }

  // 8. Profils atypiques détectés par la détection d'anomalies ML
  if (anomaliesMl && anomaliesMl.length > 0) {
    const atypiques = anomaliesMl.filter((a) => a.est_atypique);
    if (atypiques.length > 0) {
      const cites = atypiques.slice(0, NB_MAX_AGENTS_SIGNALES);
      const noms = cites.map((a) => `${a.prenom} ${a.nom}`).join(', ');
      const complement = atypiques.length > cites.length ? ` et ${atypiques.length - cites.length} autre(s)` : '';
      recommandations.push({
        id: 'profils-atypiques-ml',
        niveau: 'attention',
        icone: 'ti-fingerprint',
        titre: 'Profils de présence atypiques détectés',
        description: `L'analyse comparative (IA) signale un profil inhabituel sur la période pour : ${noms}${complement}, sans qu'un seuil individuel ne soit nécessairement dépassé.`,
        action: 'Examiner le détail de ces agents dans le module BI avant de conclure à une anomalie avérée.',
      });
    }
  }

  // 9. Retards répétés plusieurs jours ouvrés d'affilée dans la semaine en cours
  if (anomaliesRetardSemaine && anomaliesRetardSemaine.length > 0) {
    const agentsEnRetardRepete = detecterAnomaliesConsecutives(anomaliesRetardSemaine, SEUIL_RETARDS_CONSECUTIFS);
    if (agentsEnRetardRepete.length > 0) {
      const cites = agentsEnRetardRepete.slice(0, NB_MAX_AGENTS_SIGNALES);
      const noms = cites.map((a) => `${a.nom} (${a.service}, ${a.nombreJours} jours consécutifs)`).join(', ');
      const complement =
        agentsEnRetardRepete.length > cites.length ? ` et ${agentsEnRetardRepete.length - cites.length} autre(s)` : '';
      recommandations.push({
        id: 'retards-consecutifs-semaine',
        niveau: 'critique',
        icone: 'ti-alert-octagon',
        titre: 'Avertissement — retards répétés cette semaine',
        description: `${noms}${complement} : retard constaté au moins ${SEUIL_RETARDS_CONSECUTIFS} jours ouvrés consécutifs depuis le début de la semaine.`,
        action: "Convoquer l'agent concerné pour un rappel du règlement intérieur et envisager une alerte formelle à son responsable de division.",
      });
    }
  }

  // 10. Absences répétées plusieurs jours ouvrés d'affilée dans la semaine en cours
  if (anomaliesAbsenceSemaine && anomaliesAbsenceSemaine.length > 0) {
    const agentsEnAbsenceRepetee = detecterAnomaliesConsecutives(anomaliesAbsenceSemaine, SEUIL_ABSENCES_CONSECUTIVES);
    if (agentsEnAbsenceRepetee.length > 0) {
      const cites = agentsEnAbsenceRepetee.slice(0, NB_MAX_AGENTS_SIGNALES);
      const noms = cites.map((a) => `${a.nom} (${a.service}, ${a.nombreJours} jours consécutifs)`).join(', ');
      const complement =
        agentsEnAbsenceRepetee.length > cites.length ? ` et ${agentsEnAbsenceRepetee.length - cites.length} autre(s)` : '';
      recommandations.push({
        id: 'absences-consecutives-semaine',
        niveau: 'critique',
        icone: 'ti-user-x',
        titre: 'Avertissement — absences répétées cette semaine',
        description: `${noms}${complement} : absence constatée au moins ${SEUIL_ABSENCES_CONSECUTIVES} jours ouvrés consécutifs depuis le début de la semaine, sans justification enregistrée à ce stade.`,
        action: "Contacter l'agent ou son responsable de division sans délai pour identifier le motif et vérifier qu'aucune situation grave n'est en cause.",
      });
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