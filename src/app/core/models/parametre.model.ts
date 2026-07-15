export interface ParametreOut {
  id_parametre: number;
  nom_parametre: string;
  valeur: string;
  description?: string | null;
}

export interface ParametreUpdate {
  valeur: string;
}
