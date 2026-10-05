const security = scopes => [{ IntegrationOAuth: scopes }];
const errors = { 400: { description: 'Paramètres invalides' }, 401: { description: 'Jeton absent, expiré ou invalide' }, 403: { description: 'Autorisation OAuth ou rôle insuffisant' } };
const scopes = {
  'cards:read': 'Lire les cartes et leurs types',
  'cards:write': 'Modifier le statut des cartes (admin ou appel)',
  'names:write': 'Ajouter des noms à la présaisie (admin ou appel)',
};

module.exports = {
  scheme: {
    type: 'oauth2',
    description: 'Code d’autorisation avec PKCE S256 obligatoire. Enregistrement du client via POST /register.',
    flows: { authorizationCode: { authorizationUrl: '/authorize', tokenUrl: '/token', refreshUrl: '/token', scopes } },
  },
  paths: {
    '/integration/capabilities': {
      get: { tags: ['Intégration Firefox'], summary: 'Vérifier la prise en charge de l’ajout des seuls noms absents', security: security(['names:write']), responses: { ...errors, 200: { description: 'importMissingNames : true' } } },
    },
    '/integration/cards': {
      get: {
        tags: ['Intégration Firefox'], summary: 'Récupérer les cartes à faire et les noms', security: security(['cards:read']),
        parameters: [
          { name: 'status', in: 'query', description: 'Sans filtre : demande et impression. all : tous les statuts.', schema: { type: 'string', enum: ['demande', 'impression', 'disponible', 'all'] } },
          { name: 'cardType', in: 'query', schema: { type: 'string' } },
        ],
        responses: { ...errors, 200: { description: 'Cartes visibles selon le rôle, sans email ni détails privés', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: {
          id: { type: 'integer' }, applicantName: { type: 'string' }, cardType: { type: 'string' }, status: { type: 'string', enum: ['demande', 'impression', 'disponible'] }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
        } } } } } } },
      },
    },
    '/integration/card-types': {
      get: { tags: ['Intégration Firefox'], summary: 'Lister les types de cartes', security: security(['cards:read']), responses: { ...errors, 200: { description: 'Liste des types (code, label)' } } },
    },
    '/integration/cards/{id}/status': {
      patch: {
        tags: ['Intégration Firefox'], summary: 'Modifier le statut (admin ou appel)', security: security(['cards:write']),
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['demande', 'impression', 'disponible'] } } } } } },
        responses: { ...errors, 200: { description: 'Carte avec son statut actualisé' }, 404: { description: 'Carte introuvable' } },
      },
    },
    '/integration/names': {
      post: {
        tags: ['Intégration Firefox'], summary: 'Ajouter un nom à la présaisie (admin ou appel)', security: security(['names:write']),
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 200 }, cardType: { type: 'string', description: 'Code d’un type existant, facultatif' }, onlyIfMissing: { type: 'boolean', description: 'Si vrai, ne modifie jamais un nom déjà présent ; retourne added.' }, alternateName: { type: 'string', maxLength: 200, description: 'Autre ordre du prénom et du nom, uniquement utilisé pour éviter un doublon.' } } } } } },
        responses: { ...errors, 200: { description: 'Nom enregistré ; un nom existant est mis à jour sans doublon' } },
      },
    },
  },
};
