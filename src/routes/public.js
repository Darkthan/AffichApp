const express = require('express');
const { db } = require('../services/db');
const { getAll: getTypes } = require('../services/cardTypes');

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
