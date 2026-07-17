export const environment = {
  production: true,
  // URL absolue HTTPS du backend. Avec le docker-compose.prod.yml fourni,
  // frontend et backend sont sur deux sous-domaines distincts (DOMAIN_FRONT /
  // DOMAIN_API) : cette URL DOIT donc être absolue, pas relative.
  // Adapter au domaine réel de déploiement avant le build de production.
  apiUrl: 'https://api.srb.hautematsiatra.mg/api/v1',
  // Client ID OAuth Google (console Google Cloud). Doit correspondre au GOOGLE_CLIENT_ID du backend.
  // IMPORTANT : dans Google Cloud Console > Identifiants > ce Client ID > "Authorized
  // JavaScript origins", ajouter le domaine HTTPS réel du frontend en prod
  // (ex: https://srb.hautematsiatra.mg), sinon Google refusera l'affichage du bouton.
  googleClientId: '689643947131-iucmm8a59hg4jki1e56bov5hg1uk9t76.apps.googleusercontent.com',
  // Clé partagée envoyée en en-tête X-Device-Key par le poste de scan (cf. environment.ts).
  // À CHANGER en prod pour une vraie valeur secrète, identique au DEVICE_API_KEY du backend.
  deviceApiKey: 'change-me-device-key',
};
