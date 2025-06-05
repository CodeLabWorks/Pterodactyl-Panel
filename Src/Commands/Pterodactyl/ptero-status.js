const { SlashCommandBuilder } = require('discord.js');
const { api } = require('../../utils/pterodactyl');
const autocompleteServers = require('../../utils/autocompleteServers');


module.exports = {
  name: "ptero-status",
  description: "Get resource usage and server state",
  category: "Pterodactyl",
  usage: "/ptero-status",
  cooldown: 5,

  data: new SlashCommandBuilder()
    .setName('ptero-status')
    .setDescription('Get server resource usage and current state')
    .addStringOption(option =>
      option.setName('server_id')
        .setDescription('Server ID')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const serverId = interaction.options.getString('server_id');
    await interaction.deferReply({ flags: 64 });

    try {
      const res = await api.get(`/servers/${serverId}/resources`);
      const { current_state, resources } = res.data.attributes;

      const output = `🖥️ **Status**: ${current_state}
📊 CPU: ${resources.cpu_absolute.toFixed(1)}%
💾 RAM: ${(resources.memory_bytes / 1024 / 1024).toFixed(1)} MB
📀 Disk: ${(resources.disk_bytes / 1024 / 1024).toFixed(1)} MB`;

      await interaction.editReply(output);
    } catch (err) {
      await interaction.editReply(`❌ Error: \`${err.message}\``);
    }
  },

  async autocomplete(interaction) {
    await autocompleteServers(interaction);
  }
};
