// Script de test pour vérifier le fonctionnement de fail2ban
// Usage: node scripts/test-fail2ban.js

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

function makeLoginAttempt(email, password) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ email, password });

    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Requested-With': 'XMLHttpRequest'
      }
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
        } catch (e) {
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

async function testFail2Ban() {
  console.log('\n=== Test Fail2Ban ===\n');
  console.log('Ce script va faire 6 tentatives de connexion échouées');
  console.log('La 5ème devrait déclencher un bannissement\n');

  for (let i = 1; i <= 6; i++) {
    console.log(`\nTentative ${i}/6...`);
    try {
      const result = await makeLoginAttempt('admin@example.com', 'mauvais_mot_de_passe');
      console.log(`  → Statut HTTP: ${result.status}`);
      console.log(`  → Réponse:`, result.data);

      if (result.status === 403) {
        console.log('\n✓ Bannissement détecté !');
        console.log('Le message affiché à l\'utilisateur est:', result.data.message);
        console.log('IP bannie:', result.data.clientIp);
        break;
      }

      // Attendre 100ms entre chaque tentative
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (e) {
      console.error('  → Erreur:', e.message);
    }
  }

  console.log('\n=== Fin du test ===\n');
}

// Vérifier que le serveur tourne
http.get(`http://${HOST}:${PORT}/health`, (res) => {
  if (res.statusCode === 200) {
    testFail2Ban().catch(console.error);
  } else {
    console.error('Le serveur ne répond pas correctement. Démarrez-le avec: npm start');
    process.exit(1);
  }
}).on('error', () => {
  console.error(`Impossible de se connecter au serveur sur http://${HOST}:${PORT}`);
  console.error('Démarrez le serveur avec: npm start');
  process.exit(1);
});
