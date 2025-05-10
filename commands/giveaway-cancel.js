const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway-cancel')
    .setDescription('Cancel a giveaway')
    .addStringOption(option =>
      option.setName('message_id')
        .setDescription('ID of the giveaway message')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const messageId = interaction.options.getString('message_id');

    try {
      const msg = await interaction.channel.messages.fetch(messageId);
      await msg.delete();
      await interaction.reply('🛑 Giveaway cancelled and message deleted.');
    } catch (err) {
      console.error(err);
      interaction.reply({ content: '❌ Could not cancel. Check the message ID.', ephemeral: true });
    }
  }
};
