export type TypePeriode = 'jour' | 'semaine' | 'mois' | 'annee';
export type CritereClassement = 'ponctualite' | 'retards';

export interface ServiceTempsReel {
  id_service: number | null;
  nom_service: string;
  nombre_agents_attendus: number;
  nombre_presents: number;
  nombre_sortis: number;
  nombre_absents: number;
  nombre_retardataires: number;
  taux_presence: number | null;
}

export interface TableauBordTempsReel extends ServiceTempsReel {
  jour: string;
  detail_services: ServiceTempsReel[];
}

export interface IndicateursGlobaux {
  nombre_agents: number;
  jours_ouvres: number;
  jours_presents: number;
  nombre_retards: number;
  nombre_absences: number;
  nombre_departs_anticipes: number;
  heures_travaillees: number;
  taux_presence: number | null;
}

export interface PointTendance {
  periode_debut: string;
  periode_fin: string;
  globaux: IndicateursGlobaux;
}

export interface ClassementAgentOut {
  id_agent: number;
  matricule: string;
  nom: string;
  prenom: string;
  id_service: number | null;
  nom_service: string;
  jours_ouvres: number;
  jours_presents: number;
  nombre_retards: number;
  nombre_absences: number;
  nombre_departs_anticipes: number;
  heures_travaillees: number;
  taux_presence: number | null;
}

export interface ServiceCompareOut {
  id_service: number | null;
  nom_service: string;
  nombre_agents: number;
  jours_ouvres: number;
  jours_presents: number;
  nombre_retards: number;
  nombre_absences: number;
  nombre_departs_anticipes: number;
  heures_travaillees: number;
  taux_presence: number | null;
  rang: number;
}

export interface ComparaisonServicesOut {
  type_periode: TypePeriode;
  periode_debut: string;
  periode_fin: string;
  globaux: IndicateursGlobaux;
  services: ServiceCompareOut[];
}

export interface PointPrevisionOut {
  periode_debut: string;
  periode_fin: string;
  taux_presence_estime: number | null;
}

export interface PrevisionOut {
  granularite: TypePeriode;
  id_service: number | null;
  methode: string;
  historique: PointTendance[];
  prevision: PointPrevisionOut[];
  avertissement: string;
}
