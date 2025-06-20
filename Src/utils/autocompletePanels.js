const { getUserConfigs } = require("./pterodactyl");

module.exports = async function (interaction) {
  const userId = interaction.user.id;
  const focused = interaction.options.getFocused();

  try {
    const configs = getUserConfigs(userId);
    const matches = configs
      .filter((cfg) => cfg.name.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map((cfg, i) => ({
        name: cfg.name,
        value: cfg.name,
      }));

    await interaction.respond(matches);
  } catch (err) {
    await interaction.respond([]);
  }
};
