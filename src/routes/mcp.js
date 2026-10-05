const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const oauth = require('../services/oauth');
const { getById } = require('../services/users');
const { db } = require('../services/db');
const { getAll: getCardTypes, findByCode } = require('../services/cardTypes');
const { validateNewRequest, validateUpdateRequest, validateStatus } = require('../services/validator');
const suggestions = require('../services/suggestions');
const { origin } = require('./oauth');

const router = express.Router();
const result = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const failure = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });
const normalizeName = (name) => String(name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

function serverFor(user) {
  const server = new McpServer({ name: 'demandes-cartes', version: '1.0.0' });

  server.registerTool('list_card_types', { description: 'Liste les types de cartes disponibles', inputSchema: {} },
    async () => result(await getCardTypes()));

  server.registerTool('list_requests', { description: 'Liste les demandes de cartes accessibles au compte connecté', inputSchema: {} }, async () => {
    const items = await db.getAll();
    return result(user.role === 'admin' || user.role === 'appel' ? items : items.filter((item) => item.ownerId === user.id));
  });

  server.registerTool('get_request', { description: 'Consulte une demande de carte accessible au compte connecté', inputSchema: { id: z.number().int().positive() } }, async ({ id }) => {
    const item = await db.getById(id);
    if (!item || (user.role !== 'admin' && user.role !== 'appel' && item.ownerId !== user.id)) { return failure('Demande introuvable ou accès refusé.'); }
    return result(item);
  });

  server.registerTool('create_request', { description: 'Crée une demande de carte. Si le nom est absent de la base, demander explicitement à l’utilisateur de vérifier son orthographe et de préciser élève, professeur ou personnel avant de rappeler cet outil.', inputSchema: {
    applicantName: z.string(), cardType: z.string(), email: z.string().optional(), details: z.string().optional(),
    confirmUnknownName: z.boolean().optional().describe('Vrai seulement après confirmation explicite de l’orthographe par l’utilisateur'),
    personCategory: z.enum(['eleve', 'professeur', 'personnel']).optional().describe('Catégorie donnée par l’utilisateur si le nom est inconnu')
  } }, async (input) => {
    if (user.role === 'appel') { return failure('Votre rôle ne permet pas de créer une demande.'); }
    const { confirmUnknownName, personCategory, ...fields } = input;
    const payload = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
    const checked = validateNewRequest(payload);
    if (!checked.valid) { return failure(`Données invalides : ${checked.errors.join(', ')}`); }
    if (!await findByCode(payload.cardType)) { return failure('Type de carte inconnu.'); }
    const name = normalizeName(payload.applicantName);
    const knownNames = await suggestions.getAll();
    const existingRequests = await db.getAll();
    const known = knownNames.some((item) => normalizeName(item.name) === name) ||
      existingRequests.some((item) => normalizeName(item.applicantName) === name);
    if (!known && (!confirmUnknownName || !personCategory)) {
      return result({ needsConfirmation: true, message: `Le nom « ${payload.applicantName} » est absent de la base. Son orthographe est-elle correcte ? La personne est-elle élève, professeur ou membre du personnel ?`, required: ['confirmUnknownName', 'personCategory'] });
    }
    const categoryType = { eleve: 'etudiants', professeur: 'enseignants', personnel: 'personnels' };
    if (!known && payload.cardType !== categoryType[personCategory]) {
      return failure(`Le type de carte ne correspond pas à la catégorie confirmée. Utiliser « ${categoryType[personCategory]} » ou corriger la catégorie.`);
    }
    return result(await db.create(payload, user));
  });

  server.registerTool('update_applicant_name', { description: 'Corrige uniquement le nom d’une demande (propriétaire ou admin). Si le nouveau nom est absent de la base, demander à l’utilisateur de confirmer son orthographe et de préciser élève, professeur ou personnel avant de rappeler cet outil.', inputSchema: {
    id: z.number().int().positive(), applicantName: z.string(),
    confirmUnknownName: z.boolean().optional().describe('Vrai seulement après confirmation explicite de l’orthographe par l’utilisateur'),
    personCategory: z.enum(['eleve', 'professeur', 'personnel']).optional().describe('Catégorie donnée par l’utilisateur si le nom est inconnu')
  } }, async ({ id, applicantName, confirmUnknownName, personCategory }) => {
    if (user.role === 'appel') { return failure('Votre rôle ne permet pas de modifier une demande.'); }
    const item = await db.getById(id);
    if (!item || (user.role !== 'admin' && item.ownerId !== user.id)) { return failure('Demande introuvable ou accès refusé.'); }
    const name = applicantName.trim();
    const checked = validateUpdateRequest({ applicantName: name });
    if (!checked.valid) { return failure(`Données invalides : ${checked.errors.join(', ')}`); }
    if (name === item.applicantName) { return result(item); }
    const normalized = normalizeName(name);
    const knownNames = await suggestions.getAll();
    const existingRequests = await db.getAll();
    const known = knownNames.some((entry) => normalizeName(entry.name) === normalized) ||
      existingRequests.some((entry) => normalizeName(entry.applicantName) === normalized);
    if (!known && (!confirmUnknownName || !personCategory)) {
      return result({ needsConfirmation: true, message: `Le nom « ${name} » est absent de la base. Son orthographe est-elle correcte ? La personne est-elle élève, professeur ou membre du personnel ?`, required: ['confirmUnknownName', 'personCategory'] });
    }
    const categoryType = { eleve: 'etudiants', professeur: 'enseignants', personnel: 'personnels' };
    if (!known && item.cardType !== categoryType[personCategory]) {
      return failure(`Le type de carte de cette demande ne correspond pas à la catégorie confirmée (${personCategory}).`);
    }
    return result(await db.updateFields(id, { applicantName: name }));
  });

  server.registerTool('update_request_status', { description: 'Change le statut d’une demande (admin ou appel)', inputSchema: {
    id: z.number().int().positive(), status: z.string()
  } }, async ({ id, status }) => {
    if (!['admin', 'appel'].includes(user.role)) { return failure('Votre rôle ne permet pas de modifier le statut.'); }
    if (!validateStatus(status).valid) { return failure('Statut invalide.'); }
    const updated = await db.updateStatus(id, status);
    return updated ? result(updated) : failure('Demande introuvable.');
  });

  return server;
}

router.all('/', async (req, res, next) => {
  try {
    const bearer = /^Bearer (\S+)$/i.exec(req.get('Authorization') || '');
    const userId = bearer && await oauth.verifyAccess(bearer[1]);
    const user = userId && await getById(userId);
    if (!user) {
      res.set('WWW-Authenticate', `Bearer resource_metadata="${origin(req)}/.well-known/oauth-protected-resource/mcp", scope="mcp"`);
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (req.method !== 'POST') { return res.status(405).set('Allow', 'POST').end(); }
    const server = serverFor(user);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { server.close().catch(() => {}); });
    await server.connect(transport);
    return await transport.handleRequest(req, res, req.body);
  } catch (error) { return next(error); }
});

module.exports = { router };
