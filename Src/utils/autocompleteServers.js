// utils/autocompleteServers.js
const { fetchServers } = require('./pterodactyl');

module.exports = async function (interaction) {
  const focused = interaction.options.getFocused();
  try {
    const servers = await fetchServers();
    const filtered = servers
      .filter(s => s.name.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map(s => ({ name: s.name, value: s.id }));

    await interaction.respond(filtered);
  } catch (err) {
    await interaction.respond([]);
  }
};
