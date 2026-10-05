# API OAuth pour l’intégration Firefox

L’API est disponible sous `/api/integration`. Elle réutilise la connexion des comptes AffichApp via un code d’autorisation avec PKCE S256, sans secret à intégrer dans l’extension. L’extension n’a pas accès au mot de passe : l’utilisateur se connecte sur la page d’autorisation AffichApp.

## Accès

| Autorisation OAuth | Usage |
| --- | --- |
| `cards:read` | Lire les cartes et leurs types |
| `cards:write` | Modifier les statuts |
| `names:write` | Ajouter des noms dans la présaisie |

Les autorisations OAuth s’ajoutent aux droits du compte. Les comptes `admin` et `appel` peuvent lire toutes les cartes, changer leurs statuts et ajouter des noms à la présaisie. Un compte `requester` peut seulement lire ses propres cartes. Demander un scope ne donne jamais plus de droits que ceux du compte.

## Connexion depuis Firefox

1. Configurer l’origine HTTPS d’AffichApp. En production, `APP_BASE_URL` doit correspondre à cette origine.
2. Utiliser `browser.identity.getRedirectURL()` pour obtenir l’URI de retour de l’extension. Ajouter la permission `identity`, `storage` et la permission d’hôte pour le domaine AffichApp dans le manifeste. Les appels réseau doivent partir du contexte de l’extension, pas d’un script injecté dans une page tierce.
3. Enregistrer une fois le client avec `POST /register` et conserver `client_id` dans le stockage de l’extension :

```json
{
  "client_name": "Firefox Cartes",
  "redirect_uris": ["https://URI-DE-RETOUR-EXACTE/"],
  "token_endpoint_auth_method": "none"
}
```

4. Générer un `state` aléatoire et un `code_verifier` cryptographiquement aléatoire (43 à 128 caractères). Calculer `code_challenge = BASE64URL(SHA256(code_verifier))`, sans padding.
5. Ouvrir l’URL suivante avec `browser.identity.launchWebAuthFlow({ url, interactive: true })` :

```text
/authorize?client_id=CLIENT_ID
&redirect_uri=URI_ENCODEE
&response_type=code
&code_challenge=CHALLENGE
&code_challenge_method=S256
&state=STATE
&scope=cards%3Aread%20cards%3Awrite%20names%3Awrite
```

Les paramètres doivent être encodés avec `URLSearchParams`. L’URL ci-dessus est présentée sur plusieurs lignes pour la lecture. Le paramètre facultatif `resource` doit être l’URL absolue `https://votre-domaine/api/integration`.

6. Vérifier que le `state` du retour correspond exactement au `state` enregistré ; sinon abandonner la connexion. Échanger le code avec `POST /token`, corps `application/x-www-form-urlencoded` :

```text
grant_type=authorization_code
client_id=CLIENT_ID
code=CODE_RECU
redirect_uri=URI_DE_RETOUR_EXACTE
code_verifier=VERIFIER
```

7. Conserver les jetons dans le contexte privé de l’extension et envoyer `Authorization: Bearer ACCESS_TOKEN` à chaque appel. Ne pas transmettre de jetons aux pages visitées, ni les écrire dans les journaux. Le jeton d’accès dure une heure. Pour le renouveler, envoyer `grant_type=refresh_token`, `client_id` et `refresh_token` à `/token` et remplacer **les deux** jetons stockés par ceux retournés. Le renouvellement conserve les scopes et invalide les anciens jetons. Sérialiser les renouvellements pour éviter des rafraîchissements concurrents.

La découverte est disponible sur `/.well-known/oauth-authorization-server` et `/.well-known/oauth-protected-resource/api/integration`. Les anciens jetons MCP restent utilisables pour MCP ; un nouveau consentement est requis pour les scopes d’intégration.

## Récupérer les cartes à faire

```http
GET /api/integration/cards
Authorization: Bearer ACCESS_TOKEN
```

Renvoie par défaut les cartes `demande` et `impression`, avec `id`, `applicantName`, `cardType`, `status`, `createdAt` et `updatedAt`. Les emails et les détails privés ne sont pas renvoyés.

```json
[
  {
    "id": 42,
    "applicantName": "Martin Dupont",
    "cardType": "etudiants",
    "status": "demande",
    "createdAt": "2026-10-05T08:00:00.000Z",
    "updatedAt": "2026-10-05T08:00:00.000Z"
  }
]
```

Pour extraire les noms, utiliser `cards.map(card => card.applicantName)`. Conserver les `id` pour modifier les statuts : plusieurs demandes peuvent porter le même nom.

Filtres facultatifs : `?status=demande`, `?status=impression`, `?status=disponible`, `?status=all` et `?cardType=etudiants`. `GET /api/integration/card-types` fournit les codes et libellés disponibles.

## Changer un statut

```http
PATCH /api/integration/cards/42/status
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{"status":"impression"}
```

Les statuts acceptés sont `demande`, `impression` et `disponible`. La réponse contient la carte avec son statut actualisé. Le scope `cards:write` et un compte `admin` ou `appel` sont requis.

## Ajouter un nom à la présaisie

```http
POST /api/integration/names
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{"name":"Martin Dupont","cardType":"etudiants"}
```

`cardType` est facultatif et doit désigner un type existant. Le nom est limité à 200 caractères, sans caractères de contrôle. Le nom est immédiatement disponible dans la présaisie du formulaire existant. Cela ne crée pas de demande de carte. Les doublons sont regroupés sans tenir compte des accents, de la casse ou des espaces répétés. Le scope `names:write` et un compte `admin` ou `appel` sont requis.

Pour l’enrichissement automatique IDCapt, envoyer également `onlyIfMissing: true` et, si disponible, `alternateName` contenant l’ordre prénom puis nom. Un nom déjà présent (dans l’un des deux ordres) conserve sa catégorie et son compteur. La réponse indique `added: true` ou `added: false`. La vérification et l’ajout sont sérialisés pour éviter les doublons entre imports concurrents. `GET /api/integration/capabilities` avec le scope `names:write` renvoie `importMissingNames: true` ; l’extension vérifie ce support avant toute écriture automatique.

## Erreurs

| Code HTTP | Signification |
| --- | --- |
| 400 | Statut, identifiant, nom ou type invalide |
| 401 | Jeton absent, invalide ou expiré : renouveler ou reconnecter |
| 403 | Scope ou rôle insuffisant |
| 404 | Carte inexistante |
| 429 | Trop de tentatives de connexion ou de renouvellement |

Les écritures de cette API utilisent uniquement des jetons OAuth vérifiés. Elles n’exigent pas `X-Requested-With`. Les sessions JWT du site et les clés API ne sont pas acceptées sur ces routes.

L’API est documentée également dans Swagger (`/api/docs`). L’extension RISO existante n’est pas modifiée par cette API ; le branchement décrit ci-dessus sera à réaliser dans l’extension de gestion des cartes.

Références : [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749.html), [PKCE S256](https://www.rfc-editor.org/rfc/rfc7636.html), [connexion OAuth dans Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity).
