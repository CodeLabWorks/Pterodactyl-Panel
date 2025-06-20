const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { getUserConfigs, createAPI } = require("../../utils/pterodactyl");
const autocompletePanels = require("../../utils/autocompletePanels");
const autocompleteServers = require("../../utils/autocompleteServers");

module.exports = {
  name: "ptero-status",
  description: "Get resource usage and server state",
  category: "Pterodactyl",
  usage: "/ptero-status",
  cooldown: 5,

  data: new SlashCommandBuilder()
    .setName("ptero-status")
    .setDescription("Get server resource usage and current state")
    .addStringOption((option) =>
      option
        .setName("panel")
        .setDescription("Which panel to use")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("server_id")
        .setDescription("Server ID")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const panelName = interaction.options.getString("panel");
    const serverId = interaction.options.getString("server_id");

    // Get user panel config
    const configs = getUserConfigs(userId);

    if (!configs.length) {
      return interaction.reply({
        content:
          "❌ You do not have any panel data configured. Please run `/ptero-setup` to set up your panel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const cfg = configs.find((c) => c.name === panelName);
    if (!cfg) {
      return interaction.reply({
        content: `❌ Panel "${panelName}" not found.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const api = createAPI(cfg.panelURL, cfg.apiKey);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const res = await api.get(`/servers/${serverId}/resources`);
      const { current_state, resources } = res.data.attributes;

      const output = `🖥️ **Status**: ${current_state}
📊 **CPU**: ${resources.cpu_absolute.toFixed(1)}%
💾 **RAM**: ${(resources.memory_bytes / 1024 / 1024).toFixed(1)} MB
📀 **Disk**: ${(resources.disk_bytes / 1024 / 1024).toFixed(1)} MB`;

      await interaction.editReply({ content: output });
    } catch (err) {
      await interaction.editReply({ content: `❌ Error: \`${err.message}\`` });
    }
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === "panel") {
      return autocompletePanels(interaction);
    }
    if (focused.name === "server_id") {
      return autocompleteServers(interaction);
    }
  },
};
