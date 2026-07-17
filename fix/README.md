# Systeme-de-pointage-et-BI_Front
# SRB Haute Matsiatra — Frontend (Angular)

Socle du frontend Angular consommant l'API FastAPI (`srb_backend`) :
connexion, coquille applicative (sidebar/topbar) et tableau de bord
décisionnel (BI). Les autres modules (Agents, Services, Pointage, Anomalies,
Rapports, Utilisateurs & rôles, Paramètres) sont pour l'instant des pages
« en construction » à brancher module par module.

## Démarrage

```bash
npm install
npm start        # ng serve — http://localhost:4200
```

Le backend doit tourner sur `http://localhost:8000` (CORS déjà configuré
pour `http://localhost:4200`, cf. `.env.example` du backend). L'URL de l'API
est centralisée dans `src/environments/environment.ts`.

Avant de tester la connexion, pensez à avoir exécuté côté backend :
`alembic upgrade head` puis `python -m scripts.seed_reference_data`, et à
avoir créé au moins un compte `utilisateur` (rôles/permissions déjà semés).

## Ce qui est en place

- **Authentification** (`src/app/features/auth/login`) : connexion locale
  (formulaire OAuth2 attendu par `/auth/login`), demande de réinitialisation
  de mot de passe. Bouton Google désactivé (à activer une fois
  `GOOGLE_CLIENT_ID` configuré côté backend).
- **Intercepteur HTTP** (`core/interceptors/auth.interceptor.ts`) : ajoute le
  `Bearer <token>`, rafraîchit automatiquement l'access token sur un 401 et
  rejoue la requête une fois.
- **Garde de route** (`core/guards/auth.guard.ts`) : protège la coquille
  applicative, charge `/auth/me` si besoin.
- **Coquille** (`src/app/layout/shell`) : sidebar + topbar, items de menu
  filtrés par permission RBAC (`consulter_bi`, `valider_roles`).
- **Tableau de bord** (`src/app/features/dashboard`) : KPI du jour, tendance
  30 jours, comparaison entre services, classement de ponctualité, prévision
  — tout branché sur `/bi/*`.
- **Design** : les tokens et classes visuelles communes (cartes, tableaux,
  badges, filtres...) repris de `mockup_srb.html` vivent dans
  `src/styles.scss`, réutilisables par tous les modules à venir.

## Prochaines étapes suggérées

Ajouter les modules un par un (Agents → Services → Pointage → Anomalies →
Rapports → Utilisateurs & rôles → Paramètres), en remplaçant à chaque fois
le composant `AVenirComponent` correspondant dans `app.routes.ts`.