// Script de test pour vérifier la détection d'IP derrière un reverse proxy
// Usage: node scripts/test-proxy-ip.js

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

function makeLoginAttempt(email, password, fakeIp) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ email, password });

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'X-Requested-With': 'XMLHttpRequest'
    };

    // Simuler un reverse proxy qui ajoute le header X-Forwarded-For
    if (fakeIp) {
      headers['X-Forwarded-For'] = fakeIp;
    }

    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (_e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

async function testProxyIp() {
  console.log('\n=== Test de détection d\'IP derrière reverse proxy ===\n');

  const testIp = '203.0.113.42'; // IP de test (plage documentaire RFC 5737)

  console.log(`1. Test avec X-Forwarded-For: ${testIp}`);
  console.log('   (simulant un reverse proxy qui ajoute cet en-tête)\n');

  for (let i = 1; i <= 6; i++) {
    console.log(`Tentative ${i}/6 avec IP simulée ${testIp}...`);
    try {
      const result = await makeLoginAttempt('admin@example.com', 'mauvais_mdp', testIp);
      console.log(`  → Statut HTTP: ${result.status}`);

      if (result.status === 403) {
        console.log('\n✓ Bannissement détecté !');
        console.log('Message:', result.data.message);
        console.log('IP bannie:', result.data.clientIp);

        if (result.data.clientIp === testIp) {
          console.log('\n✅ SUCCÈS: La vraie IP client a été détectée correctement !');
        } else {
          console.log(`\n❌ ERREUR: IP détectée (${result.data.clientIp}) != IP simulée (${testIp})`);
        }
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (e) {
      console.error('  → Erreur:', e.message);
    }
  }

  console.log('\n2. Vérification des logs serveur:');
  console.log('   Regardez les logs du serveur pour voir les headers détectés.');
  console.log('   Vous devriez voir: "x-forwarded-for": "' + testIp + '"');

  console.log('\n=== Fin du test ===\n');
}

// Vérifier que le serveur tourne
http.get(`http://${HOST}:${PORT}/health`, (res) => {
  if (res.statusCode === 200) {
    testProxyIp().catch(console.error);
  } else {
    console.error('Le serveur ne répond pas correctement. Démarrez-le avec: npm start');
    process.exit(1);
  }
}).on('error', () => {
  console.error(`Impossible de se connecter au serveur sur http://${HOST}:${PORT}`);
  console.error('Démarrez le serveur avec: npm start');
  process.exit(1);
});
