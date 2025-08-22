const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('../services/db');
const { getAll: getTypes } = require('../services/cardTypes');
const calls = require('../services/calls');
const { getLogoPathIfExists } = require('../services/settings');
const fsSync = require('fs');

const router = express.Router();

// Returns public list of available cards to pick up (no auth required)
router.get('/available-requests', async (req, res, next) => {
  try {
    const [items, types] = await Promise.all([db.getAll(), getTypes()]);
    const typeMap = Object.fromEntries(types.map((t) => [t.code, t.label]));
    const available = items
      .filter((x) => x.status === 'disponible')
      .map((x) => ({
        id: x.id,
        applicantName: x.applicantName,
        cardType: x.cardType,
        cardTypeLabel: typeMap[x.cardType] || x.cardType,
        availableSince: x.updatedAt || x.createdAt,
      }));
    res.json(available);
  } catch (err) {
    next(err);
  }
});

module.exports = { router };

// Public endpoint for ongoing calls
router.get('/calls', async (req, res, next) => {
  try {
    const items = await calls.getAll();
    // Keep only required fields for display
    const safe = items.map((x) => ({ id: x.id, name: x.name, location: x.location, createdAt: x.createdAt }));
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

// Static HTML page with embedded data (no JavaScript required)
router.get('/display-static', async (req, res, next) => {
  try {
    // Read the template file
    const templatePath = path.join(__dirname, '..', 'public', 'display-static.html');
    let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

    // Get data for available cards
    const [requests, types] = await Promise.all([db.getAll(), getTypes()]);
    const typeMap = Object.fromEntries(types.map((t) => [t.code, t.label]));
    const available = requests
      .filter((x) => x.status === 'disponible')
      .map((x) => ({
        id: x.id,
        applicantName: x.applicantName,
        cardType: x.cardType,
        cardTypeLabel: typeMap[x.cardType] || x.cardType,
        availableSince: x.updatedAt || x.createdAt,
      }));

    // Get calls data
    const callsData = await calls.getAll();
    const safeCalls = callsData.map((x) => ({ 
      id: x.id, 
      name: x.name, 
      location: x.location, 
      createdAt: x.createdAt 
    }));

    // Helper functions
    const getRandomColorClass = () => {
      const colors = ['bg-color-1', 'bg-color-2', 'bg-color-3', 'bg-color-4'];
      return colors[Math.floor(Math.random() * colors.length)];
    };

    const formatDate = (iso) => {
      try {
        const d = new Date(iso);
        return d.toLocaleString('fr-FR');
      } catch { 
        return iso; 
      }
    };

    // Generate HTML for available cards
    let availableCardsHtml = '';
    if (available.length === 0) {
      availableCardsHtml = '<div class="no-items">Aucune carte disponible pour le moment.</div>';
    } else {
      available.forEach((card) => {
        availableCardsHtml += `
          <div class="card-item ${getRandomColorClass()}">
            <div class="name">${card.applicantName}</div>
            <div class="muted">Type: ${card.cardTypeLabel}</div>
            <div class="timestamp">Depuis: ${formatDate(card.availableSince)}</div>
          </div>
        `;
      });
    }

    // Generate HTML for calls
    let callsHtml = '';
    if (safeCalls.length === 0) {
      callsHtml = '<div class="no-items">Aucun appel en cours.</div>';
    } else {
      safeCalls.forEach((call) => {
        callsHtml += `
          <div class="card-item ${getRandomColorClass()}">
            <div class="name">${call.name}</div>
            <div class="location">📍 ${call.location}</div>
            <div class="timestamp">Depuis: ${formatDate(call.createdAt)}</div>
          </div>
        `;
      });
    }

    // Replace placeholders in template
    htmlTemplate = htmlTemplate.replace('<!-- AVAILABLE_CARDS_PLACEHOLDER -->', availableCardsHtml);
    htmlTemplate = htmlTemplate.replace('<!-- CALLS_PLACEHOLDER -->', callsHtml);
    htmlTemplate = htmlTemplate.replace('<!-- TIMESTAMP_PLACEHOLDER -->', new Date().toLocaleString('fr-FR'));
    // Logo placeholder
    const logoPath = await getLogoPathIfExists();
    const logoTag = logoPath ? '<img class="logo" src="/public/logo" alt="Logo" />' : '';
    htmlTemplate = htmlTemplate.replace('<!-- LOGO_PLACEHOLDER -->', logoTag);

    // Send the generated HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlTemplate);
  } catch (err) {
    next(err);
  }
});

// Serve logo if available
router.get('/logo', async (req, res) => {
  try {
    const p = await getLogoPathIfExists();
    if (!p) return res.status(404).send('Not Found');
    const stream = fsSync.createReadStream(p);
    // Content-Type based on extension
    if (p.endsWith('.png')) res.type('png');
    else if (p.endsWith('.jpg')) res.type('jpeg');
    else if (p.endsWith('.webp')) res.type('webp');
    else res.type('octet-stream');
    stream.pipe(res);
  } catch {
    res.status(404).send('Not Found');
  }
});
