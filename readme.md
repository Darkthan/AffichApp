# ApplicationDemandesCartes

Application web simple pour gérer des demandes de cartes: soumission par formulaire, consultation de la liste et mise à jour du statut. Stack minimaliste: API Node.js/Express + frontend statique + stockage fichier JSON.

## 🎯 Objectif

- Nom du produit: ApplicationDemandesCartes
- Public cible: petites équipes/établissements (démo/prototype)
- Problème résolu: collecter et suivre des demandes de cartes sans base de données complexe.

## ✨ Fonctionnalités

- Soumission d'une demande (nom, email, type, détails optionnels)
- Liste des demandes avec statut
- Statuts: `Demandé`, `En cours d'impression`, `Disponible`
- Types de carte personnalisables (défaut: Etudiants, Enseignants, Personnels)
- Frontend statique minimal embarqué
- Authentification JWT et rôles: Administrateur (gère demandes + comptes) et Demandeur (crée/voit ses demandes)
 - Authentification JWT et rôles: multiples rôles possibles (ex: `admin`, `requester`, `announcer`).
   - `admin`: tout gérer (demandes, types, utilisateurs, appels)
   - `requester`: créer/voir ses demandes, appels
   - `announcer`: ne voit que la fonctionnalité d'appels

## 🧱 Pile technique

- Frontend: HTML/CSS/JS (statique)
- Backend: Node.js 18+, Express 4
- Stockage: fichier JSON local (`data/requests.json` géré automatiquement)

## 📂 Architecture

- `src/services/db.js`: accès au stockage JSON (CRUD minimal)
- `src/services/users.js`: utilisateurs (hashage mot de passe, rôles)
- `src/services/cardTypes.js`: types de cartes (liste + ajout custom)
- `src/services/auth.js`: JWT + bcrypt
- `src/routes/requests.js`: routes API REST `/api/requests`
- `src/routes/auth.js`: login, register (admin), me
- `src/routes/users.js`: gestion utilisateurs (admin)
- `src/routes/cardTypes.js`: gestion types de cartes
- `src/public/`: frontend statique (formulaire + liste)
- `src/server.js`: composition de l'app Express

## ✅ Prérequis

- Node.js 18+ et npm
- Accès disque en écriture (répertoire `data/`)
 - Variables d'environnement (optionnelles): `JWT_SECRET`, `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_PASSWORD`

## 🚀 Démarrage rapide

1) Installer les dépendances

```bash
npm install
```

2) Lancer en développement

```bash
npm start
```

3) Ouvrir l'application

- Frontend: http://localhost:3000/
- API: http://localhost:3000/api/requests
 - Page publique (sans auth): http://localhost:3000/display.html (cartes disponibles)

## 🐳 Démarrage via Docker

1) Builder et lancer avec Compose

```bash
docker compose up --build -d
```

2) Accéder à l'application

- Frontend: http://localhost:3000/
- API: http://localhost:3000/api/requests

Notes:
- Les données sont persistées sur votre hôte dans `./data` via un volume.
- Pour arrêter: `docker compose down` (ajoutez `-v` pour supprimer le volume si besoin).

### Scripts npm (raccourcis)

Si Docker est installé, vous pouvez utiliser les scripts:

```bash
# Compose v2 (Docker Desktop récent)
npm run docker:up
npm run docker:logs
npm run docker:down

# Compose v1 (legacy)
npm run docker:up:v1
npm run docker:logs:v1
npm run docker:down:v1
```

Le conteneur expose un healthcheck sur `/health`. Vous pouvez vérifier l'état via `docker ps` (STATUS healthy/unhealthy).

## 🔌 API (extrait)

- `POST /api/auth/login` → `{ email, password }` → `{ token, user }`
- `GET /api/auth/me` → utilisateur courant
- `POST /api/auth/register` (admin) → créer un utilisateur `{ name, email, role, password }`
- `GET /api/users` (admin) → liste des utilisateurs
- `GET /api/users/:id` (admin) → récupérer un utilisateur
- `PATCH /api/users/:id` (admin) → modifier `{ name?, email?, role?, password? }`
- `DELETE /api/users/:id` (admin) → supprimer
- `GET /api/card-types` → liste des types
- `POST /api/card-types` (admin) → ajouter `{ label, code? }`
- `GET /api/requests` (auth) → liste des demandes (admin: toutes, demandeur: les siennes)
- `GET /api/requests/:id` (auth) → détail (restreint au propriétaire sauf admin)
- `POST /api/requests` (auth) → créer `{ applicantName, email, cardType, details? }`
- `PATCH /api/requests/:id/status` (admin) → `{ status: 'demande'|'impression'|'disponible' }`
- `DELETE /api/requests/:id` (auth, owner ou admin) → suppression de la demande
- `GET /public/available-requests` (public) → demandes avec statut disponible

## 🧪 Tests

Inclut un test d'API minimal (Jest + Supertest) avec authentification:

```bash
npm test
```

## 📏 Qualité & CI

- Lint: `npm run lint`
- Format: `npm run format` / vérifier: `npm run format:check`

CI GitHub Actions incluse:
- Job "Node smoke checks": installe Node 18, exécute lint, `npm run smoke` et `npm test`.
- Job "Docker build": build l'image avec Buildx (sans push).

## 📦 Déploiement

- Usage démo/local (stockage fichier). Pour production, remplacer le stockage par une base (SQLite/PostgreSQL) et ajouter l'authentification.

## 🗺️ Structure du dépôt

```
ApplicationDemandesCartes/
├─ src/
│  ├─ public/            # Frontend statique
│  ├─ routes/            # Routes API
│  ├─ services/          # Accès données & validation
│  └─ server.js          # Entrée serveur
├─ data/                 # Fichiers de données (ignorés par Git)
├─ package.json
├─ readme.md
└─ .gitignore
```

## 🤝 Contribuer

1. Branche `feat/xxx` ou `fix/yyy`
2. Commits atomiques et descriptifs
3. PR avec description et étapes de test

## 🔐 Sécurité

- Pas de secrets stockés. Données locales en clair (`data/requests.json`).
- Ne pas exposer tel quel en production.

## 📅 Roadmap (idées)

- [ ] Authentification (ex: JWT / Azure AD)
- [ ] Export PDF / Email de notification
- [ ] Base de données SQLite/PostgreSQL
- [ ] Tableau de bord administrateur

## 📝 Licence

À définir.

## 📬 Contact

- Équipe: à compléter
- Email: à compléter
