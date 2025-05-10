const ms = require('ms');
const { EmbedBuilder } = require('discord.js');

async function startGiveaway(interaction, durationStr, winnerCount, prize, requiredRole) {
  const durationMs = ms(durationStr);
  if (!durationMs || durationMs < 10000) {
    return interaction.reply({ content: '⏳ Invalid duration.', ephemeral: true });
  }

  const endTime = Date.now() + durationMs;
  const embed = new EmbedBuilder()
    .setTitle('🎉 Giveaway Started!')
    .setDescription(
      `**Prize:** ${prize}\n` +
      `React with 🎉 to enter!\n` +
      `**Ends:** <t:${Math.floor(endTime / 1000)}:R>\n` +
      `**Winners:** ${winnerCount}\n` +
      `**Required Role:** ${requiredRole}`
    )
    .setColor('Random')
    .setFooter({ text: `Started by ${interaction.user.tag}` });

  const message = await interaction.channel.send({ embeds: [embed] });
  await message.react('🎉');

  await interaction.reply({ content: `Giveaway started for **${prize}**!`, ephemeral: true });

  setTimeout(async () => {
    const fetched = await interaction.channel.messages.fetch(message.id);
    const users = await fetched.reactions.cache.get('🎉').users.fetch();
    const validEntries = users.filter(user =>
      !user.bot &&
      interaction.guild.members.cache.get(user.id)?.roles.cache.has(requiredRole.id)
    );

    if (validEntries.size === 0) {
      return interaction.channel.send('❌ No valid participants.');
    }

    const entries = [...validEntries.values()];
    const winners = [];

    for (let i = 0; i < Math.min(winnerCount, entries.length); i++) {
      let winner;
      do {
        winner = entries[Math.floor(Math.random() * entries.length)];
      } while (winners.includes(winner));
      winners.push(winner);
    }

    interaction.channel.send(`🎊 Congrats ${winners.map(u => `<@${u.id}>`).join(', ')}! You won **${prize}**!`);
  }, durationMs);
}

module.exports = { startGiveaway };
