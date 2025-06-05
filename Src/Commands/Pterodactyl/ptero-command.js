const { SlashCommandBuilder } = require('discord.js');
const { api } = require('../../utils/pterodactyl');
const autocompleteServers = require('../../utils/autocompleteServers');

module.exports = {
  name: "ptero-command",
  description: "Send a command to a server's console",
  category: "Pterodactyl",
  usage: "/ptero-command",
  cooldown: 5,

  data: new SlashCommandBuilder()
    .setName('ptero-command')
    .setDescription('Send a console command to a server')
    .addStringOption(opt =>
      opt.setName('server_id')
        .setDescription('Server ID')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName('command')
        .setDescription('Command to send')
        .setRequired(true)
    ),

  async execute(interaction) {
    const serverId = interaction.options.getString('server_id');
    const command = interaction.options.getString('command');
    await interaction.deferReply({ flags: 64 });

    try {
      await api.post(`/servers/${serverId}/command`, { command });
      await interaction.editReply(`✅ Command sent to \`${serverId}\`: \`${command}\``);
    } catch (err) {
      await interaction.editReply(`❌ Failed to send command: \`${err.message}\``);
    }
  },

  async autocomplete(interaction) {
    await autocompleteServers(interaction);
  }
};
