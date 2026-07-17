export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api/v1',
  // Client ID OAuth2 Google (console Google Cloud > Identifiants > ID client OAuth).
  // Doit correspondre au GOOGLE_CLIENT_ID configuré côté backend (.env).
  googleClientId: '689643947131-iucmm8a59hg4jki1e56bov5hg1uk9t76.apps.googleusercontent.com',
  // Clé partagée envoyée en en-tête X-Device-Key par le poste de scan pour
  // s'authentifier auprès du backend (cf. app.api.deps.verify_device_key côté back).
  // Doit correspondre à DEVICE_API_KEY dans le .env du backend. Ce n'est PAS un
  // identifiant utilisateur : il n'a donc pas besoin d'être saisi à l'écran.
  deviceApiKey: 'change-me-device-key',
};
