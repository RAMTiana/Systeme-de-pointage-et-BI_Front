import { ServiceLight } from './service.model';

export type TypePeriode = 'jour' | 'semaine' | 'mois' | 'annee';
export type FormatRapport = 'pdf' | 'excel';

export interface RapportOut {
  id_rapport: number;
  id_utilisateur?: number | null;
  id_service?: number | null;
  service?: ServiceLight | null;
  type_periode: TypePeriode;
  date_generation: string;
  format: FormatRapport;
  chemin_fichier: string;
  periode_debut?: string | null;
  periode_fin?: string | null;
}

export interface RapportGenerateRequest {
  type_periode: TypePeriode;
  format: FormatRapport;
  id_service?: number | null;
  date_reference?: string | null;
}

export interface IndicateurAgentOut {
  id_agent: number;
  matricule: string;
  nom: string;
  prenom: string;
  jours_ouvres: number;
  jours_presents: number;
  nombre_retards: number;
  nombre_absences: number;
  nombre_departs_anticipes: number;
  heures_travaillees: number;
  taux_presence?: number | null;
}

export interface IndicateurServiceOut {
  id_service?: number | null;
  nom_service: string;
  nombre_agents: number;
  jours_ouvres: number;
  jours_presents: number;
  nombre_retards: number;
  nombre_absences: number;
  nombre_departs_anticipes: number;
  heures_travaillees: number;
  taux_presence?: number | null;
}

export interface IndicateursGlobaux {
  nombre_agents: number;
  nombre_retards: number;
  nombre_absences: number;
  nombre_departs_anticipes: number;
  heures_travaillees: number;
  taux_presence?: number | null;
}

export interface RapportContenu {
  type_periode: TypePeriode;
  periode_debut: string;
  periode_fin: string;
  id_service?: number | null;
  nom_service: string;
  globaux: IndicateursGlobaux;
  detail_agents: IndicateurAgentOut[];
  detail_services: IndicateurServiceOut[];
}
