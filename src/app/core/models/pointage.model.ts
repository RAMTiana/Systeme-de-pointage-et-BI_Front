import { AgentOut } from './agent.model';

export type TypePointage = 'entree' | 'sortie';
export type ModePointage = 'qr' | 'badge' | 'facial';
export type StatutPointage = 'valide' | 'rejete' | 'doublon';

export interface PointageOut {
  id_pointage: number;
  id_agent: number;
  date_heure: string;
  type_pointage: TypePointage;
  mode_pointage: ModePointage;
  statut: StatutPointage;
  agent?: AgentOut | null;
}
