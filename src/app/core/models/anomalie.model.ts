import { AgentOut } from './agent.model';

export type TypeAnomalie = 'retard' | 'absence' | 'depart_anticipe';
export type StatutJustification = 'en_attente' | 'justifiee' | 'non_justifiee';
export type CanalAlerte = 'email' | 'sms';
export type StatutAlerte = 'envoyee' | 'echec';

export interface JustificatifOut {
  id_justificatif: number;
  motif: string;
  piece_jointe_chemin?: string | null;
  date_depot: string;
}

export interface AlerteOut {
  id_alerte: number;
  canal: CanalAlerte;
  statut: StatutAlerte;
  destinataire: string;
  date_envoi: string;
}

export interface AnomalieOut {
  id_anomalie: number;
  id_agent: number;
  id_pointage?: number | null;
  type_anomalie: TypeAnomalie;
  statut_justification: StatutJustification;
  date_detection: string;
  id_utilisateur_traitant?: number | null;
  agent?: AgentOut | null;
}

export interface AnomalieDetailOut extends AnomalieOut {
  justificatif?: JustificatifOut | null;
  alertes: AlerteOut[];
}

export interface AnomalieExamenRequest {
  anomalie_justifiee: boolean;
  motif?: string | null;
  piece_jointe_chemin?: string | null;
}
