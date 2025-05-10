const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
require('dotenv').config();

const COLORS = {
  BLUE: '#5965ef',
  RED: '#f04645',
  GREEN: '#59f188',
  ORANGE: '#ff823f'
};
const ADMIN_ROLE_ID = process.env.GIVEAWAY_ADMIN_ROLE_ID;

// Helper functions
function parseDuration(input) {
  if (typeof input !== 'string') return null;
  const match = input.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return num * multipliers[unit];
}

function formatTimeWithTodayTomorrow(date) {
  const now = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === now.toDateString()) {
    return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  } else {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
}

function formatDuration(durationMs) {
  if (typeof durationMs !== 'number') return 'Invalid duration';
  const seconds = Math.floor((durationMs / 1000) % 60);
  const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
  const hours = Math.floor((durationMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
  const parts = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
  if (seconds > 0) parts.push(`${seconds} second${seconds > 1 ? 's' : ''}`);
  return parts.join(' ');
}

function isValidImageUrl(url) {
  if (!url) return false;
  const imageDomains = ['tr.rbxcdn.com'];
  const hasValidExtension = url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i);
  const isFromImageDomain = imageDomains.some(domain => url.includes(domain));
  return hasValidExtension || isFromImageDomain;
}

function buildReviewEmbed(prize, durationMs, winnersCount, requiredRole, hostId, imageAttachment, author) {
  const endDate = new Date(Date.now() + durationMs);
  const formattedTime = formatTimeWithTodayTomorrow(endDate);

  const embed = new EmbedBuilder()
    .setTitle(`${prize}`)
    .setDescription(
      `Click 🎉 button to enter!\n` +
      `Winners: **${winnersCount}**\n` +
      `Hosted by: <@${hostId}>\n` +
      `Ends in: **${formatDuration(durationMs)}**`
    )
    .setColor(COLORS.BLUE)
    .setFooter({
      text: `Ends at | ${formattedTime}`,
    });

  if (requiredRole) {
    embed.addFields({
      name: ' ',
      value: `Must have role: ${requiredRole}`,
      inline: true,
    });
  }

  if (imageAttachment && imageAttachment.contentType?.startsWith('image')) {
    embed.setThumbnail(imageAttachment.url);
  }

  const warningMessage = `⚠️ Review your giveaway and **click "Start" to start this giveaway!** This message expires in 15 minutes! ⚠️`;
  return {
    content: warningMessage,
    embeds: [embed]
  };
}

async function createGiveaway(channel, interaction, ms, initialPrize, initialWinnersCount, initialRequiredRole, imageAttachment, hostId) {
  const endDate = new Date(Date.now() + ms);
  const formattedTime = formatTimeWithTodayTomorrow(endDate);
  const timestamp = Math.floor(endDate.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(initialPrize || "🎉 Giveaway")
    .setDescription(
      `Click 🎉 button to enter!\n` +
      `Winners: **${initialWinnersCount}**\n` +
      `Hosted by: <@${hostId}>\n` +
      `Ends: <t:${timestamp}:R>`
    )
    .setColor(COLORS.BLUE)
    .setFooter({
      text: `Ends at | ${formattedTime}`,
    });

  if (initialRequiredRole) {
    embed.addFields({
      name: ' ',
      value: `Must have role: ${initialRequiredRole}`,
      inline: true,
    });
  }

  if (imageAttachment && imageAttachment.contentType?.startsWith('image')) {
    embed.setThumbnail(imageAttachment.url);
  }

  const joinBtn = new ButtonBuilder()
    .setCustomId('join_giveaway')
    .setLabel('0')
    .setEmoji('🎉')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(joinBtn);

  const msg = await channel.send({
    embeds: [embed],
    components: [row],
  });

  const entries = new Map();

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: ms,
  });

  // Store all editable data in the giveaway object
  interaction.client.activeGiveaways.set(msg.id, {
    collector,
    entries,
    channel: msg.channel,
    prize: initialPrize,
    winnersCount: initialWinnersCount,
    requiredRole: initialRequiredRole,
    hostId,
    duration: ms,
    imageUrl: imageAttachment?.url,
    message: msg,
    embedData: {
      title: initialPrize || "🎉 Giveaway",
      description: `Click 🎉 button to enter!\nWinners: **${initialWinnersCount}**\nHosted by: <@${hostId}>\nEnds: <t:${timestamp}:R>`,
      footerText: `Ends at | ${formattedTime}`,
      requiredRoleText: initialRequiredRole ? `Must have role: ${initialRequiredRole}` : null,
      thumbnail: imageAttachment?.url
    }
  });

// In the collector.on('collect') event handler in giveaway.js
collector.on('collect', async (i) => {
  if (i.customId !== 'join_giveaway') return;

  const giveawayData = interaction.client.activeGiveaways.get(i.message.id);
  if (!giveawayData) return;

  if (giveawayData.requiredRole && !i.member.roles.cache.has(giveawayData.requiredRole.id)) {
    const errorEmbed = new EmbedBuilder()
      .setDescription(`❌ You need the ${giveawayData.requiredRole} role to enter this giveaway.`)
      .setColor(COLORS.RED);
    return i.reply({ embeds: [errorEmbed], ephemeral: true });
  }

  if (giveawayData.entries.has(i.user.id)) {
    const warningEmbed = new EmbedBuilder()
      .setDescription('❗ You have already entered this giveaway!')
      .setColor(COLORS.ORANGE);
    return i.reply({ embeds: [warningEmbed], ephemeral: true });
  }

  giveawayData.entries.set(i.user.id, i.user);
  
  // Create a new embed using the current data from activeGiveaways
  const endDate = new Date(Date.now() + giveawayData.duration);
  const timestamp = Math.floor(endDate.getTime() / 1000);
  
  const updatedEmbed = new EmbedBuilder()
    .setTitle(giveawayData.prize || "🎉 Giveaway")
    .setDescription(
      `Click 🎉 button to enter!\n` +
      `Winners: **${giveawayData.winnersCount}**\n` +
      `Hosted by: <@${giveawayData.hostId}>\n` +
      `Ends: <t:${timestamp}:R>`
    )
    .setColor(COLORS.BLUE)
    .setFooter({
      text: `Ends at | ${formatTimeWithTodayTomorrow(endDate)}`,
    });

  if (giveawayData.requiredRole) {
    updatedEmbed.addFields({
      name: ' ',
      value: `Must have role: ${giveawayData.requiredRole}`,
      inline: true,
    });
  }

  if (giveawayData.imageUrl) {
    updatedEmbed.setThumbnail(giveawayData.imageUrl);
  }

  const joinBtn = new ButtonBuilder()
    .setCustomId('join_giveaway')
    .setLabel(`${giveawayData.entries.size}`)
    .setEmoji('🎉')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(joinBtn);

  // Update the message with the current data
  await i.message.edit({ 
    embeds: [updatedEmbed], 
    components: [row] 
  });

  const successEmbed = new EmbedBuilder()
    .setDescription('🎉 You have successfully entered the giveaway!')
    .setColor(COLORS.GREEN);
  await i.reply({ embeds: [successEmbed], ephemeral: true });
});

  collector.on('end', async () => {
    const giveawayData = interaction.client.activeGiveaways.get(msg.id);
    if (!giveawayData) return;

    const users = Array.from(giveawayData.entries.values());
    const currentPrize = giveawayData.prize;
    const currentWinnersCount = giveawayData.winnersCount;

    joinBtn.setDisabled(true);
    await msg.edit({ components: [new ActionRowBuilder().addComponents(joinBtn)] });

    if (users.length === 0) {
      const noEntriesEmbed = new EmbedBuilder()
        .setTitle(`🎊 **GIVEAWAY ENDED** 🎊`)
        .setDescription(`No one entered the giveaway of **${currentPrize}**!`)
        .setColor(COLORS.RED)
        .setFooter({ text: `Ended at | ${formatTimeWithTodayTomorrow(new Date())}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('View Giveaway')
          .setURL(msg.url)
          .setStyle(ButtonStyle.Link)
      );

      await msg.edit({
        content: '',
        embeds: [noEntriesEmbed],
        components: [new ActionRowBuilder().addComponents(joinBtn)],
      });

      const notificationEmbed = new EmbedBuilder()
        .setDescription(`❌ No one entered the giveaway of **${currentPrize}**!`)
        .setColor(COLORS.RED);

      await channel.send({
        embeds: [notificationEmbed],
        components: [row]
      });

      interaction.client.activeGiveaways.delete(msg.id);
      return;
    }

    const winners = [];
    for (let i = 0; i < currentWinnersCount && users.length > 0; i++) {
      const winner = users.splice(Math.floor(Math.random() * users.length), 1)[0];
      winners.push(winner);
    }

    const now = new Date();
    const endedAt = formatTimeWithTodayTomorrow(now);

    const winnersEmbed = new EmbedBuilder()
      .setColor(COLORS.GREEN)
      .setTitle(`🎊 **GIVEAWAY ENDED** 🎊`)
      .setDescription(`The winner${winners.length > 1 ? 's' : ''} of **${currentPrize}** ${winners.length > 1 ? 'are' : 'is'} ${winners.map(w => `<@${w.id}>`).join(', ')}. Congrats! 🎉`)
      .setFooter({
        text: `Giveaway ended at ${endedAt}`,
        iconURL: interaction.user.displayAvatarURL()
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('View Giveaway')
        .setURL(msg.url)
        .setStyle(ButtonStyle.Link)
    );

    await msg.edit({
      content: '',
      embeds: [winnersEmbed],
      components: [new ActionRowBuilder().addComponents(joinBtn)]
    });

    await channel.send({
      content: winners.map(w => `<@${w.id}>`).join(' '),
      embeds: [
        new EmbedBuilder()
          .setDescription(`${winners.map(w => `<@${w.id}>`).join(', ')} won the giveaway of **${currentPrize}**!`)
          .setColor(COLORS.GREEN)
      ],
      components: [row]
    });

    interaction.client.activeGiveaways.delete(msg.id);
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create or schedule a giveaway.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Start creating a giveaway in this channel.')
        .addStringOption(option =>
          option.setName('duration').setDescription('Duration (e.g., 30s, 10m, 1h)').setRequired(true))
        .addStringOption(option =>
          option.setName('prize').setDescription('Prize for the giveaway').setRequired(true))
        .addIntegerOption(option =>
          option.setName('winners').setDescription('Number of winners').setRequired(true))
        .addRoleOption(option =>
          option.setName('required_role').setDescription('Role required to enter'))
        .addAttachmentOption(option =>
          option.setName('image').setDescription('Upload an image as thumbnail'))
        .addStringOption(option =>
          option.setName('host').setDescription('Mention the host (@user) or leave blank for yourself'))
        .addChannelOption(option =>
          option.setName('channel').setDescription('Channel to post the giveaway in (optional)'))
    ),
  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      const embed = new EmbedBuilder()
        .setDescription('❌ You need the giveaway admin role to use this command.')
        .setColor(COLORS.RED);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    let targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    // Common options
    const duration = interaction.options.getString('duration');
    const prize = interaction.options.getString('prize');
    const winnersCount = interaction.options.getInteger('winners');
    const requiredRole = interaction.options.getRole('required_role');
    const imageAttachment = interaction.options.getAttachment('image');
    const hostInput = interaction.options.getString('host');

    // Parse host input
    let hostId = interaction.user.id;
    if (hostInput) {
      const mentionMatch = hostInput.match(/^<@!?(\d+)>$/);
      if (mentionMatch) {
        hostId = mentionMatch[1];
      } else if (/^\d+$/.test(hostInput)) {
        hostId = hostInput;
      } else {
        const embed = new EmbedBuilder()
          .setDescription('⚠️ Invalid host format. Using you as the host instead.')
          .setColor(COLORS.ORANGE);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    const ms = parseDuration(duration);
    if (!ms) {
      const embed = new EmbedBuilder()
        .setDescription('❌ Invalid duration format. Use something like 30s, 10m, 1h, etc.')
        .setColor(COLORS.RED);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const reviewContent = buildReviewEmbed(prize, ms, winnersCount, requiredRole, hostId, imageAttachment, interaction.user);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('edit_giveaway').setLabel('📝 Edit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('start_giveaway').setLabel('🚀 Start').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('cancel_giveaway').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
    );

    const reviewMsg = await interaction.reply({
      content: reviewContent.content,
      embeds: reviewContent.embeds,
      components: [row],
      fetchReply: true
    });

    const collector = reviewMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 900_000,
      filter: i => i.member.roles.cache.has(ADMIN_ROLE_ID)
    });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        const embed = new EmbedBuilder()
          .setDescription('❌ You cannot interact with this giveaway setup.')
          .setColor(COLORS.RED);
        return i.reply({ embeds: [embed], ephemeral: true });
      }

      if (i.customId === 'edit_giveaway') {
        const modal = new ModalBuilder()
          .setCustomId('edit_modal')
          .setTitle('Edit Giveaway Details')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('prize_input')
                .setLabel('Prize')
                .setValue(prize)
                .setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('duration_input')
                .setLabel('Duration (e.g., 30s, 5m, 1h)')
                .setValue(duration)
                .setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('winners_input')
                .setLabel('Number of winners')
                .setValue(winnersCount.toString())
                .setStyle(TextInputStyle.Short)
            )
          );
        await i.showModal(modal);
        const submitted = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
        if (!submitted) return;

        const newPrize = submitted.fields.getTextInputValue('prize_input');
        const newDuration = submitted.fields.getTextInputValue('duration_input');
        const newWinners = parseInt(submitted.fields.getTextInputValue('winners_input'), 10);

        const newMs = parseDuration(newDuration);
        if (!newMs || isNaN(newWinners) || newWinners <= 0) {
          const embed = new EmbedBuilder()
            .setDescription('❌ Invalid input(s). Please try again with valid values.')
            .setColor(COLORS.RED);
          return submitted.reply({ embeds: [embed], ephemeral: true });
        }

        const updatedContent = buildReviewEmbed(newPrize, newMs, newWinners, requiredRole, hostId, imageAttachment, interaction.user);
        await submitted.update({
          content: updatedContent.content,
          embeds: [updatedContent.embeds[0].setTitle(newPrize)],
          components: [row]
        });
      }

      if (i.customId === 'cancel_giveaway') {
        collector.stop('cancelled');
        const cancelEmbed = new EmbedBuilder()
          .setDescription('❌ Giveaway creation canceled.')
          .setColor(COLORS.RED);
        await i.update({
          content: '',
          embeds: [cancelEmbed],
          components: []
        });
      }

      if (i.customId === 'start_giveaway') {
        collector.stop();
        await interaction.deleteReply();
        await createGiveaway(targetChannel, interaction, ms, prize, winnersCount, requiredRole, imageAttachment, hostId);
        const successEmbed = new EmbedBuilder()
          .setDescription(`✅ Giveaway created successfully in ${targetChannel}`)
          .setColor(COLORS.GREEN);
        await i.reply({
          embeds: [successEmbed],
          ephemeral: true
        });
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'time') {
        try {
          const embed = new EmbedBuilder()
            .setDescription('⏰ Giveaway setup timed out after 15 minutes.')
            .setColor(COLORS.ORANGE);
          await interaction.editReply({ content: '', embeds: [embed], components: [] });
        } catch (error) {
          console.error('Failed to edit review message:', error);
        }
      }
    });
  }
};