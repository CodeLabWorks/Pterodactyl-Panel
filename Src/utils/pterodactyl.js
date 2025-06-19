
const axios = require('axios');
const config = {
  panelURL: process.env.PTERO_PANEL_URL,
  apiKey: process.env.PTERO_API_KEY,
};

// Ensure panelURL uses HTTPS
const sanitizedURL = config.panelURL.startsWith('http')
  ? config.panelURL.replace(/^http:/, 'https:')
  : `https://${config.panelURL}`;

const api = axios.create({
  baseURL: `${sanitizedURL}/api/client`,
  headers: {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

async function fetchServers() {
  const res = await api.get('/');
  return res.data.data.map(server => ({
    id: server.attributes.identifier,
    name: server.attributes.name,
  }));
}

module.exports = {
  api,
  fetchServers,
};
