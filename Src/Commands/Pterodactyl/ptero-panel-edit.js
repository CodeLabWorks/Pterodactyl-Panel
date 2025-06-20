const { SlashCommandBuilder, InteractionResponseFlags } = require("discord.js");
const { getUserConfigs, editUserPanel } = require("../../utils/pterodactyl");

module.exports = {
  name: "ptero-panel-edit",
  description: "Edit a saved panel's name, URL, or API key",
  category: "Pterodactyl",
  usage: "/ptero-panel-edit <name> [new-name] [panel-url] [api-key]",
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName("ptero-panel-edit")
    .setDescription("Update name, URL, or API key of a saved panel")
    .addStringOption(opt =>
      opt
        .setName("name")
        .setDescription("Current name of the panel")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName("new_name")
        .setDescription("New name for the panel")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("panel_url")
        .setDescription("New panel URL")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("api_key")
        .setDescription("New API key")
        .setRequired(false)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;

    // Check if user has any configs at all
    const configs = getUserConfigs(userId);
    if (!configs || configs.length === 0) {
      return interaction.reply({
        content:
          "❌ You don't have any panel data configured. Please run `/ptero-setup` first.",
        flags: InteractionResponseFlags.Ephemeral,
      });
    }

    const name = interaction.options.getString("name");
    const newName = interaction.options.getString("new_name");
    const rawUrl = interaction.options.getString("panel_url");
    const panelURL = rawUrl ? rawUrl.replace(/\/+$/, "") : undefined;
    const apiKey = interaction.options.getString("api_key");

    const cfg = configs.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!cfg) {
      return interaction.reply({
        content: `❌ No panel found with the name "${name}".`,
        flags: InteractionResponseFlags.Ephemeral,
      });
    }

    // Check for new name collisions (except for the same panel)
    if (newName && configs.some(c => c.name.toLowerCase() === newName.toLowerCase() && c !== cfg)) {
      return interaction.reply({
        content: `❌ You already have a panel named "${newName}".`,
        flags: InteractionResponseFlags.Ephemeral,
      });
    }

    const success = editUserPanel(userId, name, {
      name: newName,
      panelURL,
      apiKey,
    });

    if (!success) {
      return interaction.reply({
        content: `❌ Failed to update panel "${name}".`,
        flags: InteractionResponseFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: `✅ Panel "${name}" has been updated.${newName ? ` New name: ${newName}.` : ""}`,
      flags: InteractionResponseFlags.Ephemeral,
    });
  },

  async autocomplete(interaction) {
    return require("../../utils/autocompletePanels")(interaction);
  },
};
