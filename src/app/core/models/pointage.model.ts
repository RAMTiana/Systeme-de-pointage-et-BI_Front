import { AgentOut } from './agent.model';

export type TypePointage = 'entree' | 'sortie';
export type ModePointage = 'qr' | 'badge' | 'facial';
export type StatutPointage = 'valide' | 'rejete' | 'doublon';

/**
 * Motifs de sortie tracés au pointage.
 *
 * `fin_service` correspond à la sortie normale de fin de journée / fin de poste :
 * c'est la valeur par défaut et celle qui n'entraîne aucun traitement particulier.
 * Les autres valeurs identifient des sorties exceptionnelles (à la discrétion
 * de l'agent de pointage) et permettent aux RH de filtrer/justifier ces départs.
 */
export type MotifSortie =
  | 'fin_service'
  | 'urgence'
  | 'cas_familial'
  | 'medical'
  | 'mission'
  | 'pause'
  | 'autre';

export interface PointageOut {
  id_pointage: number;
  id_agent: number;
  date_heure: string;
  type_pointage: TypePointage;
  mode_pointage: ModePointage;
  statut: StatutPointage;
  motif_sortie?: MotifSortie | null;
  commentaire_motif?: string | null;
  agent?: AgentOut | null;
}