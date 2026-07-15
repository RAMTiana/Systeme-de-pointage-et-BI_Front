export interface ServiceOut {
  id_service: number;
  nom_service: string;
  description?: string | null;
  nombre_agents: number;
}

export interface ServiceCreate {
  nom_service: string;
  description?: string | null;
}

export interface ServiceUpdate {
  nom_service?: string;
  description?: string | null;
}

export interface ServiceLight {
  id_service: number;
  nom_service: string;
}
