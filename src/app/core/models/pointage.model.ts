import { AgentOut } from './agent.model';

export type TypePointage = 'entree' | 'sortie';
export type ModePointage = 'qr' | 'badge' | 'facial' | 'webauthn';
export type StatutPointage = 'valide' | 'rejete' | 'doublon';

/**
 * Motif déclaré pour une SORTIE (absent/non pertinent pour une ENTREE) : au-delà
 * de la sortie normale de fin de service, le poste de scan permet de tracer une
 * sortie exceptionnelle en cours de journée. 'autre' exige un commentaire.
 */
export type MotifSortie =
  | 'normale'
  | 'urgence'
  | 'raison_familiale'
  | 'raison_medicale'
  | 'autorisation_hierarchie'
  | 'autre';

export interface PointageOut {
  id_pointage: number;
  id_agent: number;
  date_heure: string;
  type_pointage: TypePointage;
  mode_pointage: ModePointage;
  statut: StatutPointage;
  motif_sortie?: MotifSortie | null;
  commentaire?: string | null;
  agent?: AgentOut | null;
}
