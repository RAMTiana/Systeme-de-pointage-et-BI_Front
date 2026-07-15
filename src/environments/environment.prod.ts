export const environment = {
  production: true,
  // URL absolue HTTPS du backend. À adapter au domaine réel (ex: https://api.srb.hautematsiatra.mg/api/v1).
  // Laisser '/api/v1' UNIQUEMENT si un reverse-proxy (Nginx/Traefik) sert front + back sur le même domaine.
  apiUrl: '/api/v1',
  // Client ID OAuth Google (console Google Cloud). Doit correspondre au GOOGLE_CLIENT_ID du backend.
  // Si vide, masquer le bouton "Se connecter avec Google" dans login.component.
  googleClientId: '',
};
