const { SlashCommandBuilder, InteractionResponseFlags } = require("discord.js");
const { getUserConfigs, deleteUserPanel } = require("../../utils/pterodactyl");

module.exports = {
  name: "ptero-panel-delete",
  description: "Delete a saved Pterodactyl panel",
  category: "Pterodactyl",
  usage: "/ptero-panel-delete <name>",
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName("ptero-panel-delete")
    .setDescription("Remove one of your saved panels by name")
    .addStringOption(opt =>
      opt
        .setName("name")
        .setDescription("Name of the panel to delete")
        .setRequired(true)
        .setAutocomplete(true)
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

    const success = deleteUserPanel(userId, name);
    if (!success) {
      return interaction.reply({
        content: `❌ No panel found with the name "${name}".`,
        flags: InteractionResponseFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: `✅ Panel "${name}" has been deleted.`,
      flags: InteractionResponseFlags.Ephemeral,
    });
  },

  async autocomplete(interaction) {
    return require("../../utils/autocompletePanels")(interaction);
  },
};
