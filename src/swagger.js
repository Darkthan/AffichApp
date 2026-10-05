const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { requireAuth } = require('./middleware/auth');
const integrationSpec = require('./integrationSpec');

const router = express.Router();

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Application Demandes de Cartes — API',
    version: '1.0.0',
    description: `API REST pour créer, consulter et gérer les demandes de cartes.

## Authentification

Deux méthodes sont acceptées :

- **Clé d'API** *(recommandée pour les intégrations)* : ajoutez le header \`X-API-Key: adc_...\`
- **JWT** *(session navigateur)* : ajoutez le header \`Authorization: Bearer <token>\`

Les clés d'API sont créées depuis **\`POST /api/admin/api-keys\`** (rôle admin requis).

## Rôles

| Rôle | Droits |
|------|--------|
| \`admin\` | Accès complet |
| \`requester\` | Créer/voir ses propres demandes |
| \`appel\` | Voir toutes les demandes, changer les statuts, pas de création |
    `,
    contact: {
      name: 'Support',
    },
  },
  servers: [
    { url: '/api', description: 'Serveur local' },
  ],
  components: {
    securitySchemes: {
      IntegrationOAuth: integrationSpec.scheme,
      ApiKeyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Clé d\'API au format `adc_<64 hex chars>`. Créer via POST /api/admin/api-keys.',
      },
      BearerJWT: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT obtenu via POST /api/auth/login.',
      },
    },
    schemas: {
      CardRequest: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          applicantName: { type: 'string', example: 'Martin Dupont' },
          email: { type: 'string', nullable: true, example: 'martin@example.com' },
          cardType: { type: 'string', example: 'etudiants' },
          details: { type: 'string', nullable: true, example: 'Traitement urgent' },
          status: {
            type: 'string',
            enum: ['demande', 'impression', 'disponible'],
            example: 'demande',
          },
          ownerId: { type: 'integer', nullable: true, example: 3 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      NewCardRequest: {
        type: 'object',
        required: ['applicantName', 'cardType'],
        properties: {
          applicantName: { type: 'string', example: 'Martin Dupont' },
          email: { type: 'string', example: 'martin@example.com' },
          cardType: { type: 'string', example: 'etudiants' },
          details: { type: 'string', example: 'Traitement urgent' },
        },
      },
      UpdateCardRequest: {
        type: 'object',
        properties: {
          applicantName: { type: 'string', example: 'Martin Dupont' },
          email: { type: 'string', nullable: true, example: 'martin@example.com' },
          cardType: { type: 'string', example: 'enseignants' },
          details: { type: 'string', nullable: true, example: 'Mise à jour' },
        },
      },
      UpdateStatus: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['demande', 'impression', 'disponible'],
            example: 'impression',
          },
        },
      },
      ApiKey: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Intégration SI' },
          role: { type: 'string', enum: ['admin', 'requester', 'appel'], example: 'requester' },
          createdAt: { type: 'string', format: 'date-time' },
          lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      ApiKeyCreated: {
        allOf: [
          { $ref: '#/components/schemas/ApiKey' },
          {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                example: 'adc_a3f2...',
                description: 'Clé en clair — conservez-la, elle ne sera plus affichée.',
              },
              _note: { type: 'string', example: 'Conservez cette clé, elle ne sera plus affichée.' },
            },
          },
        ],
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Not found' },
          details: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  security: [{ ApiKeyHeader: [] }, { BearerJWT: [] }],
  paths: {
    ...integrationSpec.paths,
    '/requests': {
      get: {
        summary: 'Lister les demandes de cartes',
        description:
          'Retourne toutes les demandes accessibles. Les admins et le rôle `appel` voient tout ; les `requester` ne voient que leurs propres demandes.',
        tags: ['Demandes de cartes'],
        responses: {
          200: {
            description: 'Liste des demandes',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/CardRequest' } },
              },
            },
          },
          401: { description: 'Non authentifié', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        summary: 'Créer une demande de carte',
        description: 'Crée une nouvelle demande. Le rôle `appel` ne peut pas créer de demandes.',
        tags: ['Demandes de cartes'],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/NewCardRequest' } },
          },
        },
        responses: {
          201: {
            description: 'Demande créée',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CardRequest' } } },
          },
          400: { description: 'Données invalides', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Non authentifié' },
          403: { description: 'Interdit (rôle appel)' },
        },
      },
    },
    '/requests/{id}': {
      get: {
        summary: 'Consulter une demande',
        tags: ['Demandes de cartes'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Demande trouvée', content: { 'application/json': { schema: { $ref: '#/components/schemas/CardRequest' } } } },
          401: { description: 'Non authentifié' },
          403: { description: 'Accès interdit' },
          404: { description: 'Introuvable' },
        },
      },
      patch: {
        summary: 'Modifier les champs d\'une demande',
        description: 'Modifie les champs `applicantName`, `email`, `cardType`, `details`. Réservé au propriétaire ou à un admin.',
        tags: ['Demandes de cartes'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateCardRequest' } } },
        },
        responses: {
          200: { description: 'Demande mise à jour', content: { 'application/json': { schema: { $ref: '#/components/schemas/CardRequest' } } } },
          400: { description: 'Données invalides' },
          401: { description: 'Non authentifié' },
          403: { description: 'Accès interdit' },
          404: { description: 'Introuvable' },
        },
      },
      delete: {
        summary: 'Supprimer une demande',
        description: 'Supprime une demande. Réservé au propriétaire ou à un admin.',
        tags: ['Demandes de cartes'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          204: { description: 'Supprimé' },
          401: { description: 'Non authentifié' },
          403: { description: 'Accès interdit' },
          404: { description: 'Introuvable' },
        },
      },
    },
    '/requests/{id}/status': {
      patch: {
        summary: 'Changer le statut d\'une demande',
        description: 'Met à jour le statut. Réservé aux rôles `admin` et `appel`.',
        tags: ['Demandes de cartes'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateStatus' } } },
        },
        responses: {
          200: { description: 'Statut mis à jour', content: { 'application/json': { schema: { $ref: '#/components/schemas/CardRequest' } } } },
          400: { description: 'Statut invalide' },
          401: { description: 'Non authentifié' },
          403: { description: 'Rôle insuffisant' },
          404: { description: 'Introuvable' },
        },
      },
    },
    '/admin/api-keys': {
      get: {
        summary: 'Lister les clés d\'API',
        description: 'Retourne toutes les clés d\'API existantes (sans les hashes). Rôle `admin` requis.',
        tags: ['Gestion des clés d\'API'],
        responses: {
          200: {
            description: 'Liste des clés',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } } } },
          },
          401: { description: 'Non authentifié' },
          403: { description: 'Rôle admin requis' },
        },
      },
      post: {
        summary: 'Créer une clé d\'API',
        description: 'Génère une nouvelle clé d\'API. **La clé en clair n\'est retournée qu\'une seule fois.** Rôle `admin` requis.',
        tags: ['Gestion des clés d\'API'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'role'],
                properties: {
                  name: { type: 'string', example: 'Intégration SI scolarité' },
                  role: { type: 'string', enum: ['admin', 'requester', 'appel'], example: 'requester' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Clé créée — contient la valeur en clair dans le champ `key`',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiKeyCreated' } } },
          },
          400: { description: 'Données invalides' },
          401: { description: 'Non authentifié' },
          403: { description: 'Rôle admin requis' },
        },
      },
    },
    '/admin/api-keys/{id}': {
      delete: {
        summary: 'Révoquer une clé d\'API',
        description: 'Supprime définitivement une clé d\'API. Rôle `admin` requis.',
        tags: ['Gestion des clés d\'API'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          204: { description: 'Clé révoquée' },
          401: { description: 'Non authentifié' },
          403: { description: 'Rôle admin requis' },
          404: { description: 'Clé introuvable' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Connexion (obtenir un JWT)',
        description: 'Authentifie un utilisateur et retourne un token JWT valable 7 jours.',
        tags: ['Authentification'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'admin@example.com' },
                  password: { type: 'string', example: 'admin123' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Connexion réussie',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', example: 'eyJhbGci...' },
                    user: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } } },
                  },
                },
              },
            },
          },
          401: { description: 'Identifiants incorrects' },
        },
      },
    },
    '/card-types': {
      get: {
        summary: 'Lister les types de cartes',
        description: 'Retourne les types de cartes disponibles (public, aucune authentification requise).',
        tags: ['Types de cartes'],
        security: [],
        responses: {
          200: {
            description: 'Liste des types',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      code: { type: 'string', example: 'etudiants' },
                      label: { type: 'string', example: 'Etudiants' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  tags: [
    { name: 'Demandes de cartes', description: 'CRUD sur les demandes de cartes' },
    { name: 'Gestion des clés d\'API', description: 'Créer et révoquer des clés d\'API (admin)' },
    { name: 'Authentification', description: 'Connexion et gestion de session' },
    { name: 'Types de cartes', description: 'Référentiel des types de cartes' },
  ],
};

router.use('/', requireAuth);
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(spec, {
  customSiteTitle: 'API Demandes de Cartes',
  swaggerOptions: {
    persistAuthorization: true,
    tryItOutEnabled: true,
  },
}));

router.get('/spec.json', (req, res) => res.json(spec));

module.exports = { router };
