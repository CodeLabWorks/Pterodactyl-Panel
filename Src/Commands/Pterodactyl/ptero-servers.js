const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { api } = require('../../utils/pterodactyl');

module.exports = {
  name: 'ptero-servers',
  description: 'List and manage your Pterodactyl servers',
  category: 'Pterodactyl',
  usage: '/ptero-servers',
  cooldown: 5,
  devOnly: false,
  guildOnly: false,

  data: new SlashCommandBuilder()
    .setName('ptero-servers')
    .setDescription('List all your Pterodactyl servers with pagination and controls'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const response = await api.get('/');
      const servers = response.data.data || [];
      if (!servers.length) return interaction.editReply('❌ No servers found.');

      const pageSize = 5;
      let currentPage = 0;
      const totalPages = Math.ceil(servers.length / pageSize);

      // Status mapping with emojis and colors
      const statusConfig = {
        running: { emoji: '🟢', color: '#2ECC71', name: 'Running' },
        offline: { emoji: '🔴', color: '#E74C3C', name: 'Offline' },
        installing: { emoji: '🟡', color: '#F1C40F', name: 'Installing' },
        starting: { emoji: '🟠', color: '#E67E22', name: 'Starting' },
        stopped: { emoji: '⚫', color: '#34495E', name: 'Stopped' },
      };

      // Build paginated embed with server details
      const buildPageData = async (pageIndex) => {
        const start = pageIndex * pageSize;
        const end = Math.min(start + pageSize, servers.length);
        const items = servers.slice(start, end);
        const pageDetails = [];

        const embed = new EmbedBuilder()
          .setTitle(`📋 Pterodactyl Servers - Page ${pageIndex + 1}/${totalPages}`)
          .setColor('#7289DA')
          .setDescription('Select a server from the dropdown to manage')
          .setThumbnail('https://cdn.pterodactyl.io/pterodactyl-logo.png')
          .setFooter({ text: `Showing ${start + 1}-${end} of ${servers.length} servers` });

        for (const srv of items) {
          const attr = srv.attributes;
          let status = 'unknown';
          let usage = {};
          
          try {
            const res = await api.get(`/servers/${attr.identifier}/resources`);
            status = res.data.attributes.current_state || status;
            usage = res.data.attributes.resources || {};
          } catch {}

          const config = statusConfig[status] || { emoji: '⚪', color: '#95A5A6', name: status };
          
          // Format memory display correctly (MB)
          const currentMem = usage.memory_bytes ? (usage.memory_bytes / 1024 / 1024).toFixed(1) : '0';
          const allocatedMem = (attr.limits.memory / 1024).toFixed(0);

          // Add to embed
          embed.addFields({
            name: `${config.emoji} ${attr.name}`,
            value: [
              `**ID:** \`${attr.identifier}\``,
              `**Status:** ${config.name}`,
              `**Node:** ${attr.node}`,
              `**Memory:** ${currentMem} MB / ${allocatedMem} MB`
            ].join('\n'),
            inline: true
          });

          // Store for dropdown
          pageDetails.push({
            identifier: attr.identifier,
            name: attr.name,
            status,
            currentMem,
            allocatedMem,
            config
          });
        }
        
        return { embed, pageDetails };
      };

      // Navigation row
      const buildNavRow = (pageIndex) => {
        const row = new ActionRowBuilder();
        if (pageIndex > 0) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId('prev_page')
              .setEmoji('⬅️')
              .setStyle(ButtonStyle.Secondary)
          );
        }
        row.addComponents(
          new ButtonBuilder()
            .setCustomId('page_info')
            .setLabel(`${pageIndex + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
        if (pageIndex < totalPages - 1) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId('next_page')
              .setEmoji('➡️')
              .setStyle(ButtonStyle.Secondary)
          );
        }
        return row;
      };

      // Server dropdown row
      const buildDropdownRow = (pageDetails) => {
        return new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_server')
            .setPlaceholder('Select a server to manage...')
            .addOptions(
              pageDetails.map(server => ({
                label: server.name.length > 25 ? server.name.substring(0, 22) + '...' : server.name,
                value: server.identifier,
                description: `${server.config.emoji} ${server.currentMem}MB/${server.allocatedMem}MB`,
              }))
            )
        );
      };

      // Get first page data
      const { embed: initialEmbed, pageDetails: initialDetails } = await buildPageData(currentPage);
      const message = await interaction.editReply({
        embeds: [initialEmbed],
        components: [buildNavRow(currentPage), buildDropdownRow(initialDetails)],
      });

      const collector = message.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 120000,
      });

      collector.on('collect', async (i) => {
        await i.deferUpdate();
        const id = i.customId;

        // Navigation handling
        if (id === 'next_page' || id === 'prev_page') {
          currentPage = id === 'next_page' ? currentPage + 1 : currentPage - 1;
          const { embed, pageDetails } = await buildPageData(currentPage);
          await i.editReply({
            embeds: [embed],
            components: [buildNavRow(currentPage), buildDropdownRow(pageDetails)],
          });
          return;
        }

        // Server selection from dropdown
        if (id === 'select_server') {
          const serverId = i.values[0];
          const [srvRes, resRes] = await Promise.all([
            api.get(`/servers/${serverId}`),
            api.get(`/servers/${serverId}/resources`),
          ]).catch(() => [null, null]);

          if (!srvRes) return i.followUp({ content: '❌ Failed to load server details', ephemeral: true });

          const data = srvRes.data.attributes;
          const resAttr = resRes?.data.attributes || {};
          const usage = resAttr.resources || {};
          const status = resAttr.current_state || 'unknown';

          // Get status config
          const config = statusConfig[status] || { emoji: '⚪', color: '#95A5A6', name: status };

          // Format resources correctly
          const cpu = usage.cpu_absolute ? `${usage.cpu_absolute.toFixed(1)}%` : '0%';
          const mem = usage.memory_bytes ? `${(usage.memory_bytes / 1024 / 1024).toFixed(1)} MB` : '0 MB';
          const disk = usage.disk_bytes ? `${(usage.disk_bytes / 1024 / 1024).toFixed(1)} MB` : '0 MB';
          const uptime = usage.uptime ? `${(usage.uptime / 1000 / 60).toFixed(0)} minutes` : 'N/A';
          const network = usage.network_rx_bytes 
            ? `↓ ${(usage.network_rx_bytes / 1024 / 1024).toFixed(2)} MB / ↑ ${(usage.network_tx_bytes / 1024 / 1024).toFixed(2)} MB` 
            : '0 MB';

          // Build detailed embed
          const detailEmbed = new EmbedBuilder()
            .setTitle(`${config.emoji} ${data.name}`)
            .setColor(config.color)
            .setThumbnail('https://cdn.pterodactyl.io/pterodactyl-logo.png')
            .addFields(
              { name: '📋 Identifier', value: `\`${serverId}\``, inline: true },
              { name: '🚦 Status', value: config.name, inline: true },
              { name: '🖥️ Node', value: data.node, inline: true },
              { name: '🧠 CPU', value: cpu, inline: true },
              { name: '💾 RAM', value: `${mem} / ${(data.limits.memory / 1024).toFixed(0)} MB`, inline: true },
              { name: '💿 Disk', value: `${disk} / ${(data.limits.disk / 1024).toFixed(0)} MB`, inline: true },
              { name: '⏱️ Uptime', value: uptime, inline: true },
              { name: '🌐 Network', value: network, inline: false },
            )
            .setFooter({ text: `Server ID: ${serverId}` })
            .setTimestamp();

          // Create action buttons - Row 1
          const powerRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`action_start_${serverId}`)
              .setLabel('Start')
              .setEmoji('🚀')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`action_stop_${serverId}`)
              .setLabel('Stop')
              .setEmoji('⏹️')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`action_restart_${serverId}`)
              .setLabel('Restart')
              .setEmoji('🔄')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`action_kill_${serverId}`)
              .setLabel('Kill')
              .setEmoji('☠️')
              .setStyle(ButtonStyle.Danger)
          );

          // Create utility buttons - Row 2
          const utilRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`action_refresh_${serverId}`)
              .setLabel('Refresh')
              .setEmoji('🔁')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('back_list')
              .setLabel('Back to List')
              .setEmoji('📋')
              .setStyle(ButtonStyle.Secondary)
          );

          await i.editReply({ embeds: [detailEmbed], components: [powerRow, utilRow] });
          return;
        }

        // Back to list button
        if (id === 'back_list') {
          const { embed, pageDetails } = await buildPageData(currentPage);
          await i.editReply({
            embeds: [embed],
            components: [buildNavRow(currentPage), buildDropdownRow(pageDetails)],
          });
          return;
        }

        // Power actions
        if (id.startsWith('action_')) {
          const [_, action, serverId] = id.split('_');
          
          if (action === 'refresh') {
            // Refresh server details
            const [srvRes, resRes] = await Promise.all([
              api.get(`/servers/${serverId}`),
              api.get(`/servers/${serverId}/resources`),
            ]).catch(() => [null, null]);
            
            if (!srvRes) return i.followUp({ content: '❌ Failed to refresh server details', ephemeral: true });

            const data = srvRes.data.attributes;
            const resAttr = resRes?.data.attributes || {};
            const usage = resAttr.resources || {};
            const status = resAttr.current_state || 'unknown';
            const config = statusConfig[status] || { emoji: '⚪', color: '#95A5A6', name: status };
            
            const cpu = usage.cpu_absolute ? `${usage.cpu_absolute.toFixed(1)}%` : '0%';
            const mem = usage.memory_bytes ? `${(usage.memory_bytes / 1024 / 1024).toFixed(1)} MB` : '0 MB';
            const disk = usage.disk_bytes ? `${(usage.disk_bytes / 1024 / 1024).toFixed(1)} MB` : '0 MB';
            const uptime = usage.uptime ? `${(usage.uptime / 1000 / 60).toFixed(0)} minutes` : 'N/A';
            const network = usage.network_rx_bytes 
              ? `↓ ${(usage.network_rx_bytes / 1024 / 1024).toFixed(2)} MB / ↑ ${(usage.network_tx_bytes / 1024 / 1024).toFixed(2)} MB` 
              : '0 MB';

            const refreshedEmbed = new EmbedBuilder()
              .setTitle(`🔁 ${config.emoji} ${data.name} (Refreshed)`)
              .setColor(config.color)
              .setThumbnail('https://cdn.pterodactyl.io/pterodactyl-logo.png')
              .addFields(
                { name: '📋 Identifier', value: `\`${serverId}\``, inline: true },
                { name: '🚦 Status', value: config.name, inline: true },
                { name: '🖥️ Node', value: data.node, inline: true },
                { name: '🧠 CPU', value: cpu, inline: true },
                { name: '💾 RAM', value: `${mem} / ${(data.limits.memory / 1024).toFixed(0)} MB`, inline: true },
                { name: '💿 Disk', value: `${disk} / ${(data.limits.disk / 1024).toFixed(0)} MB`, inline: true },
                { name: '⏱️ Uptime', value: uptime, inline: true },
                { name: '🌐 Network', value: network, inline: false },
              )
              .setFooter({ text: `Server ID: ${serverId} • Last refreshed` })
              .setTimestamp();

            // Recreate buttons
            const powerRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`action_start_${serverId}`)
                .setLabel('Start')
                .setEmoji('🚀')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`action_stop_${serverId}`)
                .setLabel('Stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId(`action_restart_${serverId}`)
                .setLabel('Restart')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`action_kill_${serverId}`)
                .setLabel('Kill')
                .setEmoji('☠️')
                .setStyle(ButtonStyle.Danger)
            );

            const utilRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`action_refresh_${serverId}`)
                .setLabel('Refresh')
                .setEmoji('🔁')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('back_list')
                .setLabel('Back to List')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary)
            );

            await i.editReply({ embeds: [refreshedEmbed], components: [powerRow, utilRow] });
            return;
          }

          // Power actions (start/stop/restart/kill)
          const actionNames = {
            start: 'START',
            stop: 'STOP',
            restart: 'RESTART',
            kill: 'KILL'
          };
          
          try {
            await api.post(`/servers/${serverId}/power`, { signal: action });
            await i.followUp({
              content: `⚡ Sent **${actionNames[action]}** signal to server`,
              ephemeral: true
            });
          } catch (err) {
            await i.followUp({
              content: `❌ Failed to ${action} server: ${err.message}`,
              ephemeral: true
            });
          }
        }
      });

      collector.on('end', async () => {
        // Disable components on timeout
        try {
          const navRow = buildNavRow(currentPage);
          navRow.components.forEach(comp => comp.setDisabled(true));
          
          // Create disabled dropdown
          const { pageDetails } = await buildPageData(currentPage);
          const dropdownRow = buildDropdownRow(pageDetails);
          const dropdown = dropdownRow.components[0];
          dropdown.setDisabled(true);
          
          await message.edit({ 
            components: [navRow, new ActionRowBuilder().addComponents(dropdown)] 
          });
        } catch (err) {
          console.error('Failed to disable components:', err);
        }
      });
    } catch (error) {
      console.error('Command Error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.response?.data?.message || error.message}`,
        ephemeral: true
      });
    }
  },
};