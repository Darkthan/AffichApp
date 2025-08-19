const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`ApplicationDemandesCartes en écoute sur http://localhost:${PORT}`);
  console.log('Frontend: http://localhost:' + PORT + '/');
  console.log('API: http://localhost:' + PORT + '/api/requests');
});
