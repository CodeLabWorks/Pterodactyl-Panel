const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { deleteUserConfig } = require("../../utils/pterodactyl");

module.exports = {
  name: "ptero-delete-data",
  description: "Delete all your saved Pterodactyl data",
  category: "Pterodactyl",
  usage: "/ptero-delete-data",
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName("ptero-delete-data")
    .setDescription("Erase all saved panels and data (cannot be undone)"),

  async execute(interaction) {
    const userId = interaction.user.id;

    // Fully remove user data from DB
    deleteUserConfig(userId);

    return interaction.reply({
      content: "✅ All your Pterodactyl panel data has been deleted.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
