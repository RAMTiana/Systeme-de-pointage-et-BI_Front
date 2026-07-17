export interface Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface Permission {
  id_permission: number;
  nom_permission: string;
  description?: string | null;
}

export interface Role {
  id_role: number;
  nom_role: string;
  permissions: Permission[];
}

export interface UtilisateurCourant {
  id_utilisateur: number;
  login: string;
  email: string;
  nom_complet: string;
  actif: boolean;
  email_verifie: boolean;
  auth_provider: 'local' | 'google';
  role: Role;
}
