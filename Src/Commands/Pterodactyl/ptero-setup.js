const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const axios = require("axios");
const { saveUserConfig, getUserConfigs } = require("../../utils/pterodactyl");

module.exports = {
  name: "ptero-setup",
  description: "Add a Pterodactyl panel to your account",
  category: "Pterodactyl",
  usage: "/ptero-setup",
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName("ptero-setup")
    .setDescription("Add a Pterodactyl panel to your account")
    .addStringOption((opt) =>
      opt
        .setName("panel_url")
        .setDescription("Panel base URL (e.g., https://panel.domain.com)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("api_key")
        .setDescription("Your API key from the panel")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("Name for this panel")
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const rawUrl = interaction.options.getString("panel_url");
    const panelURL = rawUrl.replace(/\/+$/, "");
    const apiKey = interaction.options.getString("api_key");
    const name = interaction.options.getString("name");

    const existing = getUserConfigs(userId) || [];

    if (existing.some((cfg) => cfg.panelURL === panelURL)) {
      return interaction.reply({
        content: `❌ You already have a panel saved with that URL.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (existing.some((cfg) => cfg.name && cfg.name.toLowerCase() === name.toLowerCase())) {
      return interaction.reply({
        content: `❌ You already have a panel saved with the name "${name}".`,
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const resp = await axios.get(`${panelURL}/api/application/nodes`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        timeout: 5000,
      });

      if (resp.status < 200 || resp.status >= 300) {
        const msg =
          resp.status === 401
            ? "Invalid API key."
            : `Received HTTP ${resp.status} from the panel.`;
        return interaction.reply({
          content: `❌ ${msg}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      if (err.response) {
        const msg =
          err.response.status === 401
            ? "Invalid API key."
            : `Panel returned HTTP ${err.response.status}.`;
        return interaction.reply({
          content: `❌ ${msg}`,
          flags: MessageFlags.Ephemeral,
        });
      } else if (err.code === "ECONNABORTED" || err.code === "ENOTFOUND") {
        return interaction.reply({
          content: `❌ Could not reach the panel at \`${panelURL}\`. Check the URL and try again.`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        return interaction.reply({
          content: `❌ An error occurred: \`${err.message}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    existing.push({ panelURL, apiKey, name });
    saveUserConfig(userId, existing);

    return interaction.reply({
      content: `✅ Panel **${name}** has been saved to your profile.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
