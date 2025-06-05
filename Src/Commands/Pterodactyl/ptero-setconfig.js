const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const autocompleteServers = require('../utils/autocompleteServers');

const configPath = path.resolve(__dirname, '../data/configs.json');

// Ensure the config file exists
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, '{}');
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function saveConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

module.exports = {
  name: "ptero-setconfig",
  description: "Set a config (only one allowed per server)",
  category: "Pterodactyl",
  usage: "/ptero-setconfig",
  cooldown: 5,
  devOnly: false,
  guildOnly: false,
  requiredRole: false,
  voiceOnly: false,
  nsfwOnly: false,
  toggleOffCmd: false,
  maintenanceCmd: false,

  data: new SlashCommandBuilder()
    .setName('ptero-setconfig')
    .setDescription('Set configuration for a server (one per server)')
    .addStringOption(opt =>
      opt.setName('server_id')
        .setDescription('Server ID')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName('value')
        .setDescription('Config value')
        .setRequired(true)
    ),

  async execute(interaction) {
    const serverId = interaction.options.getString('server_id');
    const value = interaction.options.getString('value');

    const config = loadConfig();

    if (config[serverId]) {
      return interaction.reply({ content: '❌ Config already set for this server.', flags: 64 });
    }

    config[serverId] = value;
    saveConfig(config);

    await interaction.reply({ content: `✅ Config set for \`${serverId}\`: \`${value}\``, flags: 64 });
  },

  async autocomplete(interaction) {
    await autocompleteServers(interaction);
  }
};
