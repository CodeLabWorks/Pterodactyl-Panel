const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Path to userConfigs.json inside Src/Database/
const configPath = path.resolve(__dirname, "../Database/userConfigs.json");

// Ensure the config file exists, if not create it with empty object
if (!fs.existsSync(configPath)) {
  // Ensure the directory exists too
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({}, null, 2));
}

function getUserConfigs(userId) {
  const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return data[userId] || [];
}

function saveUserConfig(userId, newConfig) {
  const data = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : {};

  // Overwrite user's config completely
  data[userId] = newConfig;

  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

// New function to delete user config completely
function deleteUserConfig(userId) {
  const data = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : {};

  if (data[userId]) {
    delete data[userId];
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  }
}

function createAPI(panelURL, apiKey) {
  return axios.create({
    baseURL: `${panelURL}/api/client`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

async function fetchServers(userId, panelIndex = 0) {
  const configs = getUserConfigs(userId);
  const config = configs[panelIndex];
  if (!config) throw new Error("Panel config not found.");

  const api = createAPI(config.panelURL, config.apiKey);
  const res = await api.get("/");
  return res.data.data.map((server) => ({
    id: server.attributes.identifier,
    name: server.attributes.name,
  }));
}

function deleteUserPanel(userId, panelName) {
  const data = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : {};

  if (!data[userId]) return false;

  const configs = data[userId];
  const idx = configs.findIndex(
    (c) => c.name.toLowerCase() === panelName.toLowerCase()
  );
  if (idx === -1) return false;

  configs.splice(idx, 1);
  data[userId] = configs;

  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  return true;
}

function editUserPanel(userId, panelName, updates) {
  const data = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : {};

  if (!data[userId]) return false;

  const configs = data[userId];
  const cfg = configs.find(
    (c) => c.name.toLowerCase() === panelName.toLowerCase()
  );
  if (!cfg) return false;

  // Apply updates safely
  if (updates.name !== undefined) cfg.name = updates.name;
  if (updates.panelURL !== undefined) cfg.panelURL = updates.panelURL;
  if (updates.apiKey !== undefined) cfg.apiKey = updates.apiKey;

  data[userId] = configs;
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  return true;
}

module.exports = {
  getUserConfigs,
  saveUserConfig,
  deleteUserConfig,
  createAPI,
  fetchServers,
  deleteUserPanel,
  editUserPanel,
};
