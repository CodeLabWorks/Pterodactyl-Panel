const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  InteractionResponseFlags,
} = require("discord.js");
const { getUserConfigs, createAPI } = require("../../utils/pterodactyl");
const autocompletePanels = require("../../utils/autocompletePanels");

module.exports = {
  name: "ptero-servers",
  description: "List and manage your Pterodactyl servers",
  category: "Pterodactyl",
  usage: "/ptero-servers",
  cooldown: 5,

  data: new SlashCommandBuilder()
    .setName("ptero-servers")
    .setDescription(
      "List all your Pterodactyl servers with pagination and controls"
    )
    .addStringOption((opt) =>
      opt
        .setName("panel")
        .setDescription("Which panel to list")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const panelName = interaction.options.getString("panel");

    // Lookup panel configs for user
    const configs = getUserConfigs(userId);

    // If user has no configs, send error + run /ptero-setup
    if (!configs.length) {
      await interaction.reply({
        content:
          "❌ You do not have any panel data configured. Please set up your panels first.",
        flags: InteractionResponseFlags.Ephemeral,
      });

      // Try to run /ptero-setup command programmatically
      const setupCommand = interaction.client.commands.get("ptero-setup");
      if (setupCommand) {
        try {
          await setupCommand.execute(interaction);
        } catch (err) {
          console.error("Failed to run /ptero-setup automatically:", err);
        }
      }
      return;
    }

    // Find selected panel config
    const cfg = configs.find((c) => c.name === panelName);
    if (!cfg) {
      return interaction.reply({
        content: `❌ Panel "${panelName}" not found.`,
        flags: InteractionResponseFlags.Ephemeral,
      });
    }

    const api = createAPI(cfg.panelURL, cfg.apiKey);
    await interaction.deferReply({ ephemeral: false });

    // Fetch servers
    let servers;
    try {
      const res = await api.get("/");
      servers = res.data.data || [];
    } catch (err) {
      return interaction.editReply(
        `❌ Failed to fetch servers: ${err.message}`
      );
    }
    if (!servers.length) {
      return interaction.editReply("❌ No servers found on that panel.");
    }

    // Status styles
    const statusConfig = {
      running: { emoji: "🟢", color: "#2ECC71", name: "Running" },
      offline: { emoji: "🔴", color: "#E74C3C", name: "Offline" },
      installing: { emoji: "🟡", color: "#F1C40F", name: "Installing" },
      starting: { emoji: "🟠", color: "#E67E22", name: "Starting" },
      stopped: { emoji: "⚫", color: "#34495E", name: "Stopped" },
    };

    const pageSize = 5;
    let currentPage = 0;
    const totalPages = Math.ceil(servers.length / pageSize);

    // Build one page of embed + dropdown options
    async function buildPage(pageIndex) {
      const slice = servers.slice(
        pageIndex * pageSize,
        (pageIndex + 1) * pageSize
      );
      const embed = new EmbedBuilder()
        .setTitle(`📋 Ptero Servers — ${pageIndex + 1}/${totalPages}`)
        .setColor("#7289DA")
        .setDescription("Select a server to manage below")
        .setThumbnail("https://cdn.pterodactyl.io/pterodactyl-logo.png")
        .setFooter({
          text: `Showing ${pageIndex * pageSize + 1}-${Math.min(
            (pageIndex + 1) * pageSize,
            servers.length
          )} of ${servers.length}`,
        });

      const details = [];

      for (const srv of slice) {
        const attr = srv.attributes;
        let status = "unknown",
          usage = {};
        try {
          const r = await api.get(`/servers/${attr.identifier}/resources`);
          status = r.data.attributes.current_state || status;
          usage = r.data.attributes.resources || {};
        } catch {}
        const cfgSt = statusConfig[status] || {
          emoji: "⚪",
          color: "#95A5A6",
          name: status,
        };
        const memCur = usage.memory_bytes
          ? (usage.memory_bytes / 1024 / 1024).toFixed(1)
          : "0";
        const memMax = (attr.limits.memory / 1024).toFixed(0);

        embed.addFields({
          name: `${cfgSt.emoji} ${attr.name}`,
          value: [
            `**ID:** \`${attr.identifier}\``,
            `**Status:** ${cfgSt.name}`,
            `**Node:** ${attr.node}`,
            `**Mem:** ${memCur}MB / ${memMax}MB`,
          ].join("\n"),
          inline: true,
        });

        details.push({
          name: attr.name,
          id: attr.identifier,
          emoji: cfgSt.emoji,
          memCur,
          memMax,
        });
      }

      // Navigation buttons
      const navRow = new ActionRowBuilder();
      if (pageIndex > 0)
        navRow.addComponents(
          new ButtonBuilder()
            .setCustomId("prev")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary)
        );
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId("page_info")
          .setLabel(`${pageIndex + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
      if (pageIndex < totalPages - 1)
        navRow.addComponents(
          new ButtonBuilder()
            .setCustomId("next")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Secondary)
        );

      // Dropdown of servers on this page
      const dd = new StringSelectMenuBuilder()
        .setCustomId("select_srv")
        .setPlaceholder("Select a server…")
        .addOptions(
          details.map((d) => ({
            label: d.name.length > 25 ? d.name.slice(0, 22) + "..." : d.name,
            value: d.id,
            description: `${d.emoji} ${d.memCur}MB/${d.memMax}MB`,
          }))
        );

      return {
        embed,
        components: [navRow, new ActionRowBuilder().addComponents(dd)],
        details,
      };
    }

    // Initial display
    const { embed, components, details } = await buildPage(0);
    const msg = await interaction.editReply({ embeds: [embed], components });

    const collector = msg.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 120_000,
    });

    collector.on("collect", async (i) => {
      await i.deferUpdate();
      const id = i.customId;

      if (id === "next" || id === "prev") {
        currentPage += id === "next" ? 1 : -1;
        const { embed: e2, components: c2 } = await buildPage(currentPage);
        return i.editReply({ embeds: [e2], components: c2 });
      }

      if (id === "select_srv") {
        const serverId = i.values[0];
        // fetch details & resources
        const [srvRes, resRes] = await Promise.all([
          api.get(`/servers/${serverId}`),
          api.get(`/servers/${serverId}/resources`),
        ]).catch(() => [null, null]);

        if (!srvRes) {
          return i.followUp({
            content: "❌ Could not load server.",
            flags: true,
          });
        }

        const attr = srvRes.data.attributes;
        const usage = resRes?.data.attributes.resources || {};
        const status = resRes?.data.attributes.current_state || "unknown";
        const cfgSt = statusConfig[status] || {
          emoji: "⚪",
          color: "#95A5A6",
          name: status,
        };

        const detailEmbed = new EmbedBuilder()
          .setTitle(`${cfgSt.emoji} ${attr.name}`)
          .setColor(cfgSt.color)
          .setThumbnail("https://cdn.pterodactyl.io/pterodactyl-logo.png")
          .addFields(
            { name: "ID", value: `\`${serverId}\``, inline: true },
            { name: "Status", value: cfgSt.name, inline: true },
            { name: "Node", value: attr.node, inline: true },
            {
              name: "CPU",
              value: usage.cpu_absolute
                ? `${usage.cpu_absolute.toFixed(1)}%`
                : "0%",
              inline: true,
            },
            {
              name: "RAM",
              value: usage.memory_bytes
                ? `${(usage.memory_bytes / 1024 / 1024).toFixed(1)}MB / ${(
                    attr.limits.memory / 1024
                  ).toFixed(0)}MB`
                : "0MB",
              inline: true,
            },
            {
              name: "Disk",
              value: usage.disk_bytes
                ? `${(usage.disk_bytes / 1024 / 1024).toFixed(1)}MB / ${(
                    attr.limits.disk / 1024
                  ).toFixed(0)}MB`
                : "0MB",
              inline: true,
            },
            {
              name: "Uptime",
              value: usage.uptime
                ? `${(usage.uptime / 1000 / 60).toFixed(0)} min`
                : "N/A",
              inline: true,
            },
            {
              name: "Net",
              value: usage.network_rx_bytes
                ? `↓ ${(usage.network_rx_bytes / 1024 / 1024).toFixed(
                    2
                  )}MB / ↑ ${(usage.network_tx_bytes / 1024 / 1024).toFixed(
                    2
                  )}MB`
                : "0MB",
              inline: false,
            }
          )
          .setFooter({ text: `Server ID: ${serverId}` })
          .setTimestamp();

        // Power buttons
        const powerRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`action_start_${serverId}`)
            .setLabel("Start")
            .setEmoji("🚀")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`action_stop_${serverId}`)
            .setLabel("Stop")
            .setEmoji("⏹️")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`action_restart_${serverId}`)
            .setLabel("Restart")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`action_kill_${serverId}`)
            .setLabel("Kill")
            .setEmoji("☠️")
            .setStyle(ButtonStyle.Danger)
        );

        const utilRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`action_refresh_${serverId}`)
            .setLabel("Refresh")
            .setEmoji("🔁")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("back_list")
            .setLabel("Back to List")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Secondary)
        );

        return i.editReply({
          embeds: [detailEmbed],
          components: [powerRow, utilRow],
        });
      }

      if (id === "back_list") {
        const { embed: e2, components: c2 } = await buildPage(currentPage);
        return i.editReply({ embeds: [e2], components: c2 });
      }

      // Handle power actions & refresh
      if (id.startsWith("action_")) {
        const [, act, srvId] = id.split("_");

        if (act === "refresh") {
          // simply reselect the same server to refresh its details
          return collector.emit("select_srv", {
            user: interaction.user,
            customId: "select_srv",
            values: [srvId],
            deferUpdate: () => Promise.resolve(),
            editReply: (opts) => msg.edit(opts),
            followUp: (opts) => interaction.followUp(opts),
          });
        }

        // send power signal
        try {
          await api.post(`/servers/${srvId}/power`, { signal: act });
          await interaction.followUp({
            content: `⚡ Sent **${act.toUpperCase()}** to ${srvId}`,
            flags: true,
          });
        } catch (err) {
          await interaction.followUp({
            content: `❌ Failed: ${err.message}`,
            flags: true,
          });
        }
      }
    });

    collector.on("end", () => {
      // disable all components
      msg.components.forEach((row) =>
        row.components.forEach((c) => c.setDisabled(true))
      );
      msg.edit({ components: msg.components }).catch(() => {});
    });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === "panel") {
      return autocompletePanels(interaction);
    }
  },
};
