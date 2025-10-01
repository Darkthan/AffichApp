# ApplicationDemandesCartes

Application web simple pour gérer des demandes de cartes: soumission par formulaire, consultation de la liste et mise à jour du statut. Stack minimaliste: API Node.js/Express + frontend statique + stockage fichier JSON.

## 🎯 Objectif

- Nom du produit: ApplicationDemandesCartes
- Public cible: petites équipes/établissements (démo/prototype)
- Problème résolu: collecter et suivre des demandes de cartes sans base de données complexe.

## ✨ Fonctionnalités

- Demandes de cartes: création (nom, email, type, détails), liste, suppression (propriétaire/admin)
- Statuts: `Demandé`, `En cours d'impression` (`impression`), `Disponible` (admin et rôle appel peuvent changer le statut)
- Types de carte personnalisables (défaut: Etudiants, Enseignants, Personnels)
- Appels de personnes: création, liste et suppression (authentifié)
- Écran d'affichage public: cartes disponibles + appels en cours (`/display.html`)
- Ajustement auto de l'affichage: la page se met à l’échelle pour afficher toutes les cartes
- Authentification JWT et rôles:
  - `admin`: tout gérer (demandes, statuts, types, utilisateurs, appels)
  - `requester`: créer/voir ses demandes, créer/lister/supprimer des appels
  - `appel`: gérer les statuts et les appels, mais ne peut pas créer/voir la liste des demandes

## 🧱 Pile technique

- Frontend: HTML/CSS/JS (statique)
- Backend: Node.js 18+, Express 4
- Stockage: fichier JSON local (`data/requests.json` géré automatiquement)

## 📂 Architecture

- `src/services/db.js`: accès au stockage JSON (CRUD minimal)
- `src/services/users.js`: utilisateurs (hashage mot de passe, rôles)
- `src/services/cardTypes.js`: types de cartes (liste + ajout custom)
- `src/services/calls.js`: appels (CRUD fichier JSON)
- `src/services/auth.js`: JWT + bcrypt
- `src/routes/requests.js`: routes API REST `/api/requests`
- `src/routes/auth.js`: login, register (admin), me
- `src/routes/users.js`: gestion utilisateurs (admin)
- `src/routes/cardTypes.js`: gestion types de cartes
- `src/routes/calls.js`: API des appels `/api/calls`
- `src/routes/public.js`: endpoints publics (`/public/available-requests`, `/public/calls`)
- `src/public/`: frontend statique (formulaire + liste)
- `src/public/display.html` + `display.js`: écran d'affichage public (cartes dispo + appels), autoscale
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
- API demandes: http://localhost:3000/api/requests
- Écran public (sans auth): http://localhost:3000/display.html (cartes disponibles + appels)

Identifiants administrateur (par défaut)
- Par défaut, un compte administrateur est créé si aucun admin n'existe encore.
- Email/Mot de passe configurables via variables d'environnement: `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_PASSWORD`.
- Valeurs par défaut (dev): `admin@example.com` / `admin123`. Pensez à les changer.

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

Astuce (compte admin par défaut):
- Par défaut, un admin est créé si aucun administrateur n'existe encore.
- Identifiants par défaut configurables via variables d'environnement: `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_PASSWORD` (défaut dev: `admin@example.com` / `admin123`).
- Si vous avez déjà un dossier `./data` avec des utilisateurs, l’admin par défaut ne sera pas recréé. Supprimez `./data/users.json` (ou `docker compose down -v`) pour repartir à zéro.

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
- `GET /api/requests` (auth) → liste des demandes (admin/appel: toutes; requester: ses demandes)
- `GET /api/requests/:id` (auth) → détail (admin/appel: accès; sinon propriétaire)
- `POST /api/requests` (auth) → créer `{ applicantName, email, cardType, details? }` (rôle `appel` interdit → 403)
- `PATCH /api/requests/:id/status` (admin/appel) → `{ status: 'demande'|'impression'|'disponible' }`
- `DELETE /api/requests/:id` (auth, owner ou admin) → suppression de la demande
- `GET /public/available-requests` (public) → demandes avec statut disponible

Appels de personnes:
- `GET /api/calls` (auth) → liste des appels
- `POST /api/calls` (auth) → créer `{ name, location }`
- `DELETE /api/calls/:id` (auth) → suppression par tout utilisateur authentifié
- `GET /public/calls` (public) → liste des appels (affichage)

Affichage:
- `GET /display.html` → affiche les cartes disponibles et les appels, mise à l’échelle automatique

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

- **JWT signé** (expiration 7j). Le secret est auto-généré en dev (`data/.jwt-secret`), **OBLIGATOIRE** en prod via `JWT_SECRET`.
- **Mots de passe hachés** (bcrypt).
- **Protection CSRF**: header `X-Requested-With: XMLHttpRequest` requis pour POST/PATCH/DELETE.
- **Fail2Ban intégré**: bannissement automatique après tentatives de connexion échouées (configurable via interface admin).
- **Rate limiting**: endpoints sensibles protégés (login, changement mot de passe).
- **En-têtes de sécurité** via Helmet.
- Pas de 2FA ni de critères complexes par défaut (volontairement simplifié).

### 🌐 Configuration Reverse Proxy

L'application détecte automatiquement l'IP réelle du client derrière un reverse proxy via les headers suivants (dans l'ordre de priorité):
1. `X-Forwarded-For` (standard)
2. `X-Real-IP` (nginx)
3. `CF-Connecting-IP` (Cloudflare)
4. `X-Client-IP` (autres)

**Configuration Express**: `app.set('trust proxy', true)` est activé par défaut.

#### Exemple nginx:
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Host $host;
}
```

#### Exemple Apache:
```apache
<VirtualHost *:80>
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-For %{REMOTE_ADDR}s
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

### 🛡️ Fail2Ban

- **Configuration**: interface admin → section "Protection Fail2Ban"
- **Paramètres par défaut**: 5 tentatives max, bannissement 15 minutes
- **Gestion**: voir les IPs bannies et débannir manuellement
- **Rate limiting et Fail2Ban** utilisent tous deux la vraie IP client (gestion automatique des proxies)

### Recommandations production:
  - Forcer HTTPS (proxy/ingress) et un `JWT_SECRET` robuste (généré via `openssl rand -base64 64`).
  - Conserver le domaine en même origine pour le front et l'API.
  - Ajuster les limites de rate limiting et fail2ban selon votre trafic.
  - Restreindre l'accès public aux seules routes `/public/*` et aux assets statiques.
  - Configurer correctement le reverse proxy pour transmettre les headers d'IP.

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

## 🏷️ Versionning

- Branche par défaut: `main`
- Version actuelle: `v1.0` (les versions antérieures sont considérées comme la série `v0`)
- Tags Git: utiliser des tags annotés pour marquer les versions.

Exemples:

```bash
# Taguer la version courante
git tag -a v1.0 -m "Version 1.0"

# Pousser la branche principale et les tags
git push origin main --tags
```

## 🐙 GitHub

- Dépôt: hébergez ce projet sur GitHub et utilisez la branche `main`.
- CI (optionnel): placez vos workflows dans `.github/workflows/` (ex: lint, tests, build Docker).
- Releases: créez une Release GitHub à partir du tag `v1.0` pour distribuer/archiver une version.
