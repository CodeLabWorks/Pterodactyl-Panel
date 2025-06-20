const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { getUserConfigs, createAPI } = require("../../utils/pterodactyl");
const autocompleteServers = require("../../utils/autocompleteServers");
const autocompletePanels = require("../../utils/autocompletePanels");

module.exports = {
  name: "ptero-command",
  description: "Send a command to a server's console",
  category: "Pterodactyl",
  usage: "/ptero-command",
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName("ptero-command")
    .setDescription("Send a console command to one of your servers")
    .addStringOption((opt) =>
      opt
        .setName("panel")
        .setDescription("Panel name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("server_id")
        .setDescription("Server ID")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt.setName("command").setDescription("Command to send").setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const panelName = interaction.options.getString("panel");
    const serverId = interaction.options.getString("server_id");
    const command = interaction.options.getString("command");

    const configs = getUserConfigs(userId);
    if (!configs || configs.length === 0) {
      return interaction.reply({
        content:
          "❌ You don't have any panel data configured. Please run `/ptero-setup` first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const config = configs.find((c) => c.name === panelName);
    if (!config) {
      return interaction.reply({
        content: `❌ Panel "${panelName}" not found`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const api = createAPI(config.panelURL, config.apiKey);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await api.post(`/servers/${serverId}/command`, { command });
      await interaction.editReply(
        `✅ Command sent to \`${serverId}\`: \`${command}\``
      );
    } catch (err) {
      await interaction.editReply(
        `❌ Failed to send command: ${err.message}`
      );
    }
  },

  async autocomplete(interaction) {
    const sub = interaction.options.getFocused(true);
    if (sub.name === "panel") return autocompletePanels(interaction);
    if (sub.name === "server_id") return autocompleteServers(interaction);
  },
};
