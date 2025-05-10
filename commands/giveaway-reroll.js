const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
require('dotenv').config();

const COLORS = {
  BLUE: '#5965ef',
  RED: '#f04645',
  GREEN: '#59f188',
  ORANGE: '#ff823f'
};

const ADMIN_ROLE_ID = process.env.GIVEAWAY_ADMIN_ROLE_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway-reroll')
    .setDescription('Select new winner(s) for a completed giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('message_id')
        .setDescription('The message ID of the giveaway to reroll')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('winners')
        .setDescription('Number of new winners to select (default: 1)')
        .setMinValue(1)
        .setMaxValue(50)),

  async execute(interaction) {
    // Permission check
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      const embed = new EmbedBuilder()
        .setDescription('❌ You need the giveaway admin role to use this command.')
        .setColor(COLORS.RED);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const messageId = interaction.options.getString('message_id');
    const winnersCount = interaction.options.getInteger('winners') || 1;

    await interaction.deferReply({ ephemeral: true });

    try {
      const giveawayMessage = await interaction.channel.messages.fetch(messageId);
      
      if (!giveawayMessage.embeds.length) {
        const embed = new EmbedBuilder()
          .setDescription('❌ This message does not appear to be a valid giveaway.')
          .setColor(COLORS.RED);
        return interaction.editReply({ embeds: [embed] });
      }

      const originalEmbed = giveawayMessage.embeds[0];
      
      const isEnded = giveawayMessage.content.includes('GIVEAWAY ENDED') || 
                     originalEmbed.description?.includes('GIVEAWAY ENDED') ||
                     originalEmbed.footer?.text?.includes('Ended at');
      
      if (!isEnded) {
        const embed = new EmbedBuilder()
          .setDescription('❌ This giveaway has not ended yet.')
          .setColor(COLORS.RED);
        return interaction.editReply({ embeds: [embed] });
      }

      let participants = [];
      const winnerMentions = originalEmbed.description?.match(/<@!?(\d+)>/g) || [];
      
      let followUpMessages = [];
      try {
        followUpMessages = await interaction.channel.messages.fetch({ limit: 5, after: giveawayMessage.id });
      } catch {}
      
      const congratsMessage = followUpMessages.find(m => 
        m.content.includes('Congratulations') && 
        m.embeds.some(e => e.description?.includes('won the giveaway'))
      );
      
      const congratsMentions = congratsMessage?.content.match(/<@!?(\d+)>/g) || [];
      const allMentions = [...new Set([...winnerMentions, ...congratsMentions])];
      
      if (allMentions.length > 0) {
        participants = allMentions.map(mention => {
          const userId = mention.replace(/<@!?(\d+)>/, '$1');
          return { id: userId };
        });
      } else {
        const buttonInteractions = await giveawayMessage.awaitReactions({ 
          filter: i => i.customId === 'join_giveaway',
          time: 5000
        }).catch(() => null);

        if (buttonInteractions) {
          participants = Array.from(buttonInteractions.values()).map(i => i.user);
        }
      }

      if (participants.length === 0) {
        const originalWinnerText = originalEmbed.description?.match(/Winner:?\s*(<@!?\d+>)/)?.[1];
        if (originalWinnerText) {
          const userId = originalWinnerText.replace(/<@!?(\d+)>/, '$1');
          participants = [{ id: userId }];
        }
      }

      if (participants.length === 0) {
        const embed = new EmbedBuilder()
          .setDescription('❌ No participants found in this giveaway. Try rerolling soon after the giveaway ends.')
          .setColor(COLORS.RED);
        return interaction.editReply({ embeds: [embed] });
      }

      const newWinners = [];
      const availableParticipants = [...participants];
      
      for (let i = 0; i < winnersCount && availableParticipants.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * availableParticipants.length);
        newWinners.push(availableParticipants.splice(randomIndex, 1)[0]);
      }

      const prize = originalEmbed.title || "the prize";
      const rerollEmbed = new EmbedBuilder()
        .setColor(COLORS.GREEN)
        .setDescription(`The new winner${newWinners.length > 1 ? 's' : ''} of **${prize}** ${newWinners.length > 1 ? 'are' : 'is'} ${newWinners.map(w => `<@${w.id}>`).join(', ')}. Congrats! 🎉`)
        .setFooter({ text: `Rerolled by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('View Giveaway')
          .setURL(giveawayMessage.url)
          .setStyle(ButtonStyle.Link)
      );

      await interaction.channel.send({
        content: newWinners.map(w => `<@${w.id}>`).join(' '),
        embeds: [rerollEmbed],
        components: [row]
      });

      const successEmbed = new EmbedBuilder()
        .setDescription(`✅ Successfully rerolled ${winnersCount} new winner${winnersCount > 1 ? 's' : ''}!`)
        .setColor(COLORS.GREEN);
      await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
      console.error('Reroll error:', error);
      
      if (error.code === 10008) {
        const embed = new EmbedBuilder()
          .setDescription('❌ Could not find a giveaway with that message ID in this channel.')
          .setColor(COLORS.RED);
        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setDescription('❌ An error occurred while processing the reroll.')
          .setColor(COLORS.RED);
        await interaction.editReply({ embeds: [embed] });
      }
    }
  }
};