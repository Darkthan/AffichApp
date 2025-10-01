const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const fail2ban = require('../services/fail2ban');

const router = express.Router();

// Middleware pour vérifier que l'utilisateur est admin
const requireAdmin = requireRole('admin');

// Obtenir la configuration fail2ban (admin only)
router.get('/config', requireAuth, requireAdmin, (req, res) => {
  try {
    const config = fail2ban.readConfig();
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: 'Erreur lecture configuration', message: e.message });
  }
});

// Mettre à jour la configuration fail2ban (admin only)
router.patch('/config', requireAuth, requireAdmin, (req, res) => {
  try {
    const { enabled, maxAttempts, banDuration } = req.body;
    const currentConfig = fail2ban.readConfig();

    const newConfig = {
      enabled: typeof enabled === 'boolean' ? enabled : currentConfig.enabled,
      maxAttempts: typeof maxAttempts === 'number' && maxAttempts > 0 ? maxAttempts : currentConfig.maxAttempts,
      banDuration: typeof banDuration === 'number' && banDuration > 0 ? banDuration : currentConfig.banDuration
    };

    const success = fail2ban.writeConfig(newConfig);
    if (success) {
      res.json({ message: 'Configuration mise à jour', config: newConfig });
    } else {
      res.status(500).json({ error: 'Erreur écriture configuration' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Erreur mise à jour configuration', message: e.message });
  }
});

// Obtenir les statistiques fail2ban (admin only)
router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  try {
    const stats = fail2ban.getStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: 'Erreur lecture statistiques', message: e.message });
  }
});

// Obtenir la liste des IPs bannies (admin only)
router.get('/banned', requireAuth, requireAdmin, (req, res) => {
  try {
    const banned = fail2ban.getBannedIps();
    res.json(banned);
  } catch (e) {
    res.status(500).json({ error: 'Erreur lecture IPs bannies', message: e.message });
  }
});

// Débannir une IP (admin only)
router.delete('/banned/:ip', requireAuth, requireAdmin, (req, res) => {
  try {
    const { ip } = req.params;
    const success = fail2ban.unbanIp(ip);
    if (success) {
      res.json({ message: `IP ${ip} débannie avec succès` });
    } else {
      res.status(404).json({ error: 'IP non trouvée dans la liste des bannies' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Erreur débannissement IP', message: e.message });
  }
});

module.exports = { router };
