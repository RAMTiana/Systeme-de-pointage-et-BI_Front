import { AgentOut } from './agent.model';

export type TypeConge = 'conge_annuel' | 'maladie' | 'maternite' | 'paternite' | 'evenement_familial' | 'sans_solde' | 'autre';
export type StatutConge = 'actif' | 'annule';

export interface CongeOut {
  id_conge: number;
  id_agent: number;
  agent?: AgentOut | null;
  type_conge: TypeConge;
  date_debut: string;
  date_fin: string;
  motif?: string | null;
  statut: StatutConge;
  id_utilisateur_saisie: number;
  date_creation: string;
}

export interface CongeCreateRequest {
  id_agent: number;
  type_conge: TypeConge;
  date_debut: string;
  date_fin: string;
  motif?: string | null;
}
