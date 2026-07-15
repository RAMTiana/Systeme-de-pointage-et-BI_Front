import { ServiceLight } from './service.model';

export type StatutAgent = 'actif' | 'desactive';

export interface Page<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface AffectationOut {
  id_affectation: number;
  id_service: number;
  service: ServiceLight;
  date_debut: string;
  date_fin?: string | null;
  service_principal: boolean;
}

export interface AffectationCreate {
  id_service: number;
  date_debut?: string | null;
  service_principal?: boolean;
}

export interface AgentOut {
  id_agent: number;
  matricule: string;
  nom: string;
  prenom: string;
  fonction?: string | null;
  statut: StatutAgent;
  consentement_facial: boolean;
  id_service?: number | null;
  service?: ServiceLight | null;
  date_creation: string;
}

export interface AgentDetailOut extends AgentOut {
  affectations: AffectationOut[];
}

export interface AgentCreate {
  matricule: string;
  nom: string;
  prenom: string;
  fonction?: string | null;
  id_service?: number | null;
}

export interface AgentUpdate {
  matricule?: string;
  nom?: string;
  prenom?: string;
  fonction?: string | null;
  id_service?: number | null;
}
