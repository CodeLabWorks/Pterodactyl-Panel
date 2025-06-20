const { getUserConfigs, fetchServers } = require("./pterodactyl");

module.exports = async function (interaction) {
  const userId = interaction.user.id;
  const focused = interaction.options.getFocused();
  const panelName = interaction.options.getString("panel");

  try {
    const configs = getUserConfigs(userId);
    const panelIndex = configs.findIndex((cfg) => cfg.name === panelName);

    if (panelIndex === -1) return await interaction.respond([]);

    const servers = await fetchServers(userId, panelIndex);
    const filtered = servers
      .filter((s) => s.name.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map((s) => ({ name: s.name, value: s.id }));

    await interaction.respond(filtered);
  } catch (err) {
    await interaction.respond([]);
  }
};
