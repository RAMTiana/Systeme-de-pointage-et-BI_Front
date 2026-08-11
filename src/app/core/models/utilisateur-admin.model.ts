export interface PermissionOut {
  id_permission: number;
  nom_permission: string;
  description?: string | null;
}

export interface RoleOut {
  id_role: number;
  nom_role: string;
  permissions: PermissionOut[];
}

export interface RoleLight {
  id_role: number;
  nom_role: string;
}

export interface UtilisateurAdminOut {
  id_utilisateur: number;
  login: string;
  email: string;
  nom_complet: string;
  actif: boolean;
  email_verifie: boolean;
  auth_provider: 'local' | 'google';
  date_creation: string;
  photo_profil?: string | null;
  role: RoleLight;
}

export interface UtilisateurCreate {
  login: string;
  email: string;
  nom_complet: string;
  mot_de_passe: string;
  id_role: number;
}

export interface UtilisateurUpdate {
  login?: string;
  email?: string;
  nom_complet?: string;
  /** Data URL base64 (JPEG/PNG/WebP, 2 Mo max décodé). Chaîne vide pour supprimer la photo actuelle. */
  photo_profil?: string;
}

export interface RoleChangeRequest {
  id_role: number;
}

export interface MotDePasseAdminUpdate {
  nouveau_mot_de_passe: string;
}
