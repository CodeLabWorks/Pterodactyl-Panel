const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { api } = require('../../utils/pterodactyl');
const autocompleteServers = require('../../utils/autocompleteServers');

module.exports = {
  name: "ptero-power",
  description: "Start, stop, restart, or kill a server",
  category: "Pterodactyl",
  usage: "/ptero-power",
  cooldown: 5,

  data: new SlashCommandBuilder()
    .setName('ptero-power')
    .setDescription('Start, stop, restart, or kill a server')
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'start', value: 'start' },
          { name: 'stop', value: 'stop' },
          { name: 'restart', value: 'restart' },
          { name: 'kill', value: 'kill' }
        )
    )
    .addStringOption(option =>
      option.setName('server_id')
        .setDescription('Server ID')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const serverId = interaction.options.getString('server_id');
    const action = interaction.options.getString('action');

    // Defer reply NON ephemeral so we can update the message later
    await interaction.deferReply({ ephemeral: false });

    let msg;
    try {
      await api.post(`/servers/${serverId}/power`, { signal: action });
      msg = await interaction.editReply(`✅ Sent \`${action}\` to server \`${serverId}\`. Fetching status...`);
    } catch (err) {
      return interaction.editReply(`❌ Error sending \`${action}\` command: \`${err.message}\``);
    }

    // Function to get server status from API
    async function getServerStatus() {
      try {
        const res = await api.get(`/servers/${serverId}/resources`);
        return res.data.attributes.current_state.toLowerCase(); // e.g. offline, running, stopping
      } catch {
        return 'unknown';
      }
    }

    // Build buttons row
    function buildButtons(disabled = false) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ptero-power-start-${serverId}`)
          .setLabel('Start')
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`ptero-power-stop-${serverId}`)
          .setLabel('Stop')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`ptero-power-restart-${serverId}`)
          .setLabel('Restart')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`ptero-power-kill-${serverId}`)
          .setLabel('Kill')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`ptero-power-refresh-${serverId}`)
          .setLabel('Refresh Status')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
      );
    }

    // Update status message with current server state
    async function updateStatusMessage(message, info = '') {
      const status = await getServerStatus();
      let content = info ? `${info}\n\n` : '';
      content += `Current server status: **${status}**`;

      try {
        if (message.editable) {
          await message.edit({ content, components: [buildButtons(false)] });
        }
      } catch (err) {
        console.error('Failed to edit message:', err);
      }

      return status;
    }

    // Initial status update
    let currentStatus = await updateStatusMessage(msg);

    // Collector timeout and logic
    const collectorTimeout = 30000; // 30 seconds

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.customId.endsWith(serverId),
      time: collectorTimeout
    });

    let timeoutHandle = setTimeout(() => collector.stop(), collectorTimeout);

    collector.on('collect', async i => {
      // Reset collector timeout on interaction
      clearTimeout(timeoutHandle);
      timeoutHandle = setTimeout(() => collector.stop(), collectorTimeout);

      await i.deferUpdate();

      // Parse action from button id: ptero-power-<action>-<serverId>
      const parts = i.customId.split('-');
      const btnAction = parts[2];

      if (btnAction === 'refresh') {
        currentStatus = await updateStatusMessage(msg, '🔄 Status refreshed.');
        return;
      }

      try {
        await api.post(`/servers/${serverId}/power`, { signal: btnAction });
        currentStatus = await updateStatusMessage(msg, `✅ Sent \`${btnAction}\` command.`);
      } catch (err) {
        await updateStatusMessage(msg, `❌ Error sending \`${btnAction}\` command: \`${err.message}\``);
        return;
      }

      // Wait up to 30 seconds for state to change to expected state based on action
      const expectedStates = {
        start: 'running',
        stop: 'offline',
        restart: 'running',
        kill: 'offline'
      };

      const expectedState = expectedStates[btnAction];

      if (!expectedState) return; // no expected state to check

      const pollInterval = 3000; // check every 3s
      const maxChecks = Math.floor(collectorTimeout / pollInterval);
      let checks = 0;
      let updated = false;

      while (checks < maxChecks) {
        await new Promise(r => setTimeout(r, pollInterval));
        const status = await getServerStatus();

        if (status === expectedState) {
          await updateStatusMessage(msg, `✅ Server state is now \`${expectedState}\` after \`${btnAction}\`.`);
          updated = true;
          break;
        } else {
          await updateStatusMessage(msg, `⏳ Waiting for server to reach \`${expectedState}\`...\nCurrent status: **${status}**`);
        }
        checks++;
      }

      if (!updated) {
        await updateStatusMessage(msg, `⚠️ Server state did not update to expected state after \`${btnAction}\` within timeout.\n\nCurrent server status: **${await getServerStatus()}**`);
      }
    });

    collector.on('end', () => {
      // Disable buttons after collector ends
      msg.edit({ components: [buildButtons(true)] }).catch(() => { });
    });
  },

  async autocomplete(interaction) {
    await autocompleteServers(interaction);
  }
};
