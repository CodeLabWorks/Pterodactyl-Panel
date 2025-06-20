const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionResponseFlags,
} = require("discord.js");
const { getUserConfigs, createAPI } = require("../../utils/pterodactyl");
const autocompletePanels = require("../../utils/autocompletePanels");
const autocompleteServers = require("../../utils/autocompleteServers");

module.exports = {
  name: "ptero-power",
  description: "Start, stop, restart, or kill a server",
  category: "Pterodactyl",
  usage: "/ptero-power",
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName("ptero-power")
    .setDescription("Start, stop, restart, or kill a server")
    .addStringOption((opt) =>
      opt
        .setName("panel")
        .setDescription("Which panel to use")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("action")
        .setDescription("Action to perform")
        .setRequired(true)
        .addChoices(
          { name: "start", value: "start" },
          { name: "stop", value: "stop" },
          { name: "restart", value: "restart" },
          { name: "kill", value: "kill" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("server_id")
        .setDescription("Server ID")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const panelName = interaction.options.getString("panel");
    const action = interaction.options.getString("action");
    const serverId = interaction.options.getString("server_id");

    // Check if user has any configs at all
    const configs = getUserConfigs(userId);
    if (!configs || configs.length === 0) {
      return interaction.reply({
        content:
          "❌ You don't have any panel data configured. Please run `/ptero-setup` first.",
        flags: InteractionResponseFlags.Ephemeral,
      });
    }

    const cfg = configs.find((c) => c.name === panelName);
    if (!cfg) {
      return interaction.reply({
        content: `❌ Panel "${panelName}" not found.`,
        flags: InteractionResponseFlags.Ephemeral,
      });
    }

    const api = createAPI(cfg.panelURL, cfg.apiKey);
    await interaction.deferReply({ flags: InteractionResponseFlags.Ephemeral });

    // Send the power signal
    try {
      await api.post(`/servers/${serverId}/power`, { signal: action });
    } catch (err) {
      return interaction.editReply(
        `❌ Error sending \`${action}\` to server \`${serverId}\`: ${err.message}`
      );
    }

    // Function to get current server status
    async function getServerStatus() {
      try {
        const res = await api.get(`/servers/${serverId}/resources`);
        return res.data.attributes.current_state.toLowerCase();
      } catch {
        return "unknown";
      }
    }

    // Build the buttons row
    function buildButtons(disabled = false) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ptero-power-start-${serverId}`)
          .setLabel("Start")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`ptero-power-stop-${serverId}`)
          .setLabel("Stop")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`ptero-power-restart-${serverId}`)
          .setLabel("Restart")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`ptero-power-kill-${serverId}`)
          .setLabel("Kill")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`ptero-power-refresh-${serverId}`)
          .setLabel("Refresh Status")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
      );
    }

    // Update the status message content
    async function updateStatusMessage(message, info = "") {
      const status = await getServerStatus();
      let content = info ? `${info}\n\n` : "";
      content += `Current server status: **${status}**`;

      try {
        if (message.editable) {
          await message.edit({ content, components: [buildButtons(false)] });
        }
      } catch (err) {
        console.error("Failed to edit message:", err);
      }

      return status;
    }

    // Send initial acknowledgment
    const msg = await interaction.editReply(
      `✅ Sent \`${action}\` to \`${serverId}\`. Fetching status...`
    );

    // Show initial status and buttons
    await updateStatusMessage(msg);

    // Collector for button interactions
    const collector = msg.createMessageComponentCollector({
      filter: (i) =>
        i.user.id === interaction.user.id && i.customId.endsWith(serverId),
      time: 30_000,
    });

    let timeoutHandle = setTimeout(() => collector.stop(), 30_000);

    collector.on("collect", async (i) => {
      clearTimeout(timeoutHandle);
      timeoutHandle = setTimeout(() => collector.stop(), 30_000);

      await i.deferUpdate();
      const parts = i.customId.split("-");
      const btnAction = parts[2];

      if (btnAction === "refresh") {
        await updateStatusMessage(msg, "🔄 Status refreshed.");
        return;
      }

      // Send the new signal
      try {
        await api.post(`/servers/${serverId}/power`, { signal: btnAction });
        await updateStatusMessage(msg, `✅ Sent \`${btnAction}\` command.`);
      } catch (err) {
        await updateStatusMessage(msg, `❌ Error: ${err.message}`);
        return;
      }

      // Poll until expected state or timeout
      const expected = {
        start: "running",
        stop: "offline",
        restart: "running",
        kill: "offline",
      }[btnAction];
      const interval = 3_000;
      const maxChecks = Math.floor(30_000 / interval);
      for (let i = 0; i < maxChecks; i++) {
        await new Promise((r) => setTimeout(r, interval));
        const status = await getServerStatus();
        if (status === expected) {
          await updateStatusMessage(msg, `✅ Server is now \`${expected}\`.`);
          return;
        } else {
          await updateStatusMessage(
            msg,
            `⏳ Waiting for \`${expected}\`… Current: **${status}**`
          );
        }
      }

      await updateStatusMessage(
        msg,
        `⚠️ Did not reach \`${expected}\` in time. Current: **${await getServerStatus()}**`
      );
    });

    collector.on("end", () => {
      msg.edit({ components: [buildButtons(true)] }).catch(() => {});
    });
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
