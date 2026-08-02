import { AgentOut } from './agent.model';

export type StatutAbsence = 'actif' | 'annule';

export interface AbsenceOut {
  id_absence: number;
  id_agent: number;
  agent?: AgentOut | null;
  date_debut: string;
  date_fin: string;
  motif?: string | null;
  statut: StatutAbsence;
  id_utilisateur_saisie: number;
  date_creation: string;
}

export interface AbsenceCreateRequest {
  id_agent: number;
  date_debut: string;
  date_fin: string;
  motif?: string | null;
}
