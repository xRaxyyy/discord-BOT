const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
  } = require('discord.js');
  require('dotenv').config();
  
  const COLORS = {
    BLUE: '#5965ef',
    RED: '#f04645',
    GREEN: '#59f188',
    ORANGE: '#ff823f'
  };
  
  const ADMIN_ROLE_ID = process.env.GIVEAWAY_ADMIN_ROLE_ID;
  
  // Helper functions (same as in giveaway.js)
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
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('giveaway-edit')
      .setDescription('Edit an ongoing giveaway')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(option =>
        option.setName('message_id')
          .setDescription('The message ID of the giveaway to edit')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('action')
          .setDescription('What to edit')
          .setRequired(true)
          .addChoices(
            { name: 'Change Duration', value: 'duration' },
            { name: 'Change Prize', value: 'prize' },
            { name: 'Change Winner Count', value: 'winners' },
            { name: 'Change Image', value: 'image' },
            { name: 'Change Required Role', value: 'role' }
          )),
    async execute(interaction) {
      try {
        const messageId = interaction.options.getString('message_id');
        const action = interaction.options.getString('action');
  
        if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
          const embed = new EmbedBuilder()
            .setDescription('❌ You need the giveaway admin role to use this command.')
            .setColor(COLORS.RED);
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
  
        const giveawayData = interaction.client.activeGiveaways.get(messageId);
        if (!giveawayData) {
          const embed = new EmbedBuilder()
            .setDescription('❌ This is not an active giveaway or it has already ended.')
            .setColor(COLORS.RED);
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
  
        const giveawayMessage = await giveawayData.channel.messages.fetch(messageId);
        if (!giveawayMessage) {
          const embed = new EmbedBuilder()
            .setDescription('❌ Message not found.')
            .setColor(COLORS.RED);
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
  
        const originalEmbed = giveawayMessage.embeds[0];
        const joinButton = giveawayMessage.components[0]?.components.find(c => c.customId === 'join_giveaway');
        if (!joinButton) {
          const embed = new EmbedBuilder()
            .setDescription('❌ This is not a valid giveaway message.')
            .setColor(COLORS.RED);
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
  
        if (joinButton.disabled) {
          const embed = new EmbedBuilder()
            .setDescription('❌ This giveaway has already ended.')
            .setColor(COLORS.RED);
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
  
        // Handle each action
        if (action === 'duration') {
          const modal = new ModalBuilder()
            .setCustomId('duration_modal')
            .setTitle('Change Giveaway Duration')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('duration_input')
                  .setLabel('New duration (e.g., 30s, 10m, 1h)')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(formatDuration(giveawayData.duration).replace(/\s+/g, ''))
              )
            );
          await interaction.showModal(modal);
  
          const submitted = await interaction.awaitModalSubmit({ time: 60_000 }).catch(() => null);
          if (!submitted) return;
          await submitted.deferReply({ ephemeral: true });
  
          const durationInput = submitted.fields.getTextInputValue('duration_input');
          const newDurationMs = parseDuration(durationInput);
  
          if (!newDurationMs) {
            const embed = new EmbedBuilder()
              .setDescription('❌ Invalid duration format. Use something like 30s, 10m, 1h, etc.')
              .setColor(COLORS.RED);
            return submitted.editReply({ embeds: [embed] });
          }
  
          // Update collector timer
          if (giveawayData.collector) {
            giveawayData.collector.resetTimer({ time: newDurationMs });
          }
  
          // Update stored data
          giveawayData.duration = newDurationMs;
          const newEndTime = new Date(Date.now() + newDurationMs);
          const newTimestamp = Math.floor(newEndTime.getTime() / 1000);
          
          // Update embed data
          giveawayData.embedData.description = giveawayData.embedData.description.replace(
            /Ends: <t:\d+:R>/,
            `Ends: <t:${newTimestamp}:R>`
          );
          giveawayData.embedData.footerText = `Ends at | ${formatTimeWithTodayTomorrow(newEndTime)}`;
          
          interaction.client.activeGiveaways.set(messageId, giveawayData);
  
          // Update embed
          const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setDescription(giveawayData.embedData.description)
            .setFooter({
              text: giveawayData.embedData.footerText
            });
  
          await giveawayMessage.edit({ embeds: [updatedEmbed] });
  
          const successEmbed = new EmbedBuilder()
            .setDescription(`✅ Giveaway duration updated to ${formatDuration(newDurationMs)}. New end time: <t:${newTimestamp}:R>`)
            .setColor(COLORS.GREEN);
  
          return submitted.editReply({ embeds: [successEmbed] });
        }
  
        if (action === 'prize') {
          const modal = new ModalBuilder()
            .setCustomId('prize_modal')
            .setTitle('Change Giveaway Prize')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('prize_input')
                  .setLabel('New prize name')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(giveawayData.prize || originalEmbed.title)
              )
            );
          await interaction.showModal(modal);
  
          const submitted = await interaction.awaitModalSubmit({ time: 60_000 }).catch(() => null);
          if (!submitted) return;
          await submitted.deferReply({ ephemeral: true });
  
          const newPrize = submitted.fields.getTextInputValue('prize_input');
  
          // Update stored data
          giveawayData.prize = newPrize;
          giveawayData.embedData.title = newPrize;
          interaction.client.activeGiveaways.set(messageId, giveawayData);
  
          // Update message
          const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setTitle(newPrize);
          await giveawayMessage.edit({ embeds: [updatedEmbed] });
  
          const successEmbed = new EmbedBuilder()
            .setDescription(`✅ Giveaway prize updated to "${newPrize}"`)
            .setColor(COLORS.GREEN);
  
          return submitted.editReply({ embeds: [successEmbed] });
        }
  
        if (action === 'winners') {
          const currentWinnersMatch = originalEmbed.description.match(/Winners: \*\*(\d+)\*\*/);
          const currentWinners = currentWinnersMatch ? currentWinnersMatch[1] : String(giveawayData.winnersCount || 1);
  
          const modal = new ModalBuilder()
            .setCustomId('winners_modal')
            .setTitle('Change Winner Count')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('winners_input')
                  .setLabel('New number of winners')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(currentWinners)
              )
            );
          await interaction.showModal(modal);
  
          const submitted = await interaction.awaitModalSubmit({ time: 60_000 }).catch(() => null);
          if (!submitted) return;
          await submitted.deferReply({ ephemeral: true });
  
          const newWinners = parseInt(submitted.fields.getTextInputValue('winners_input'), 10);
          if (isNaN(newWinners) || newWinners <= 0) {
            const embed = new EmbedBuilder()
              .setDescription('❌ Please enter a valid positive number.')
              .setColor(COLORS.RED);
            return submitted.editReply({ embeds: [embed] });
          }
  
          // Update stored data
          giveawayData.winnersCount = newWinners;
          giveawayData.embedData.description = giveawayData.embedData.description.replace(
            /Winners: \*\*\d+\*\*/,
            `Winners: **${newWinners}**`
          );
          interaction.client.activeGiveaways.set(messageId, giveawayData);
  
          // Update message
          const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setDescription(giveawayData.embedData.description);
          await giveawayMessage.edit({ embeds: [updatedEmbed] });
  
          const successEmbed = new EmbedBuilder()
            .setDescription(`✅ Number of winners updated to ${newWinners}`)
            .setColor(COLORS.GREEN);
  
          return submitted.editReply({ embeds: [successEmbed] });
        }
  
        if (action === 'image') {
          const imageUrl = giveawayData.imageUrl || originalEmbed.thumbnail?.url || '';
          const modal = new ModalBuilder()
            .setCustomId('image_modal')
            .setTitle('Change Giveaway Image')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('image_input')
                  .setLabel('New image URL')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(imageUrl)
              )
            );
          await interaction.showModal(modal);
  
          const submitted = await interaction.awaitModalSubmit({ time: 60_000 }).catch(() => null);
          if (!submitted) return;
          await submitted.deferReply({ ephemeral: true });
  
          const newImageUrl = submitted.fields.getTextInputValue('image_input');
  
          if (!isValidImageUrl(newImageUrl)) {
            const embed = new EmbedBuilder()
              .setDescription('❌ Please enter a valid image URL (.jpg, .png, etc.)')
              .setColor(COLORS.RED);
            return submitted.editReply({ embeds: [embed] });
          }
  
          // Update stored data
          giveawayData.imageUrl = newImageUrl;
          giveawayData.embedData.thumbnail = newImageUrl;
          interaction.client.activeGiveaways.set(messageId, giveawayData);
  
          // Update message
          const updatedEmbed = EmbedBuilder.from(originalEmbed).setThumbnail(newImageUrl);
          await giveawayMessage.edit({ embeds: [updatedEmbed] });
  
          const successEmbed = new EmbedBuilder()
            .setDescription('✅ Giveaway image updated successfully!')
            .setColor(COLORS.GREEN);
  
          return submitted.editReply({ embeds: [successEmbed] });
        }
  
        if (action === 'role') {
          const roleId = giveawayData.requiredRole?.id || originalEmbed.data.fields?.find(f => f.name.includes('Must have role'))?.value?.match(/<@&(\d+)>/)?.[1] || 'none';
  
          const modal = new ModalBuilder()
            .setCustomId('role_modal')
            .setTitle('Change Required Role')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('role_input')
                  .setLabel('Role ID (or "none" to remove)')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(roleId)
              )
            );
          await interaction.showModal(modal);
  
          const submitted = await interaction.awaitModalSubmit({ time: 60_000 }).catch(() => null);
          if (!submitted) return;
          await submitted.deferReply({ ephemeral: true });
  
          const roleInput = submitted.fields.getTextInputValue('role_input');
          let newRole = null;
  
          if (roleInput.toLowerCase() !== 'none') {
            if (!roleInput.match(/^\d+$/)) {
              const embed = new EmbedBuilder()
                .setDescription('❌ Please enter a valid role ID or "none"')
                .setColor(COLORS.RED);
              return submitted.editReply({ embeds: [embed] });
            }
  
            newRole = await interaction.guild.roles.fetch(roleInput);
            if (!newRole) {
              const embed = new EmbedBuilder()
                .setDescription('❌ Role not found. Please try again.')
                .setColor(COLORS.RED);
              return submitted.editReply({ embeds: [embed] });
            }
          }
  
          // Update stored data
          giveawayData.requiredRole = newRole;
          giveawayData.embedData.requiredRoleText = newRole ? `Must have role: ${newRole}` : null;
          interaction.client.activeGiveaways.set(messageId, giveawayData);
  
          // Update message
          const updatedEmbed = EmbedBuilder.from(originalEmbed);
          const filteredFields = updatedEmbed.data.fields?.filter(f => !f.name?.includes('Must have role')) || [];
  
          if (newRole) {
            filteredFields.push({
              name: ' ',
              value: `Must have role: ${newRole}`,
              inline: true
            });
          }
  
          updatedEmbed.setFields(filteredFields);
          await giveawayMessage.edit({ embeds: [updatedEmbed] });
  
          const successEmbed = new EmbedBuilder()
            .setDescription(newRole ?
              `✅ Required role updated to ${newRole}` :
              '✅ Role requirement removed')
            .setColor(COLORS.GREEN);
  
          return submitted.editReply({ embeds: [successEmbed] });
        }
      } catch (error) {
        console.error('Error editing giveaway:', error);
        const embed = new EmbedBuilder()
          .setDescription(`❌ Failed to edit giveaway: ${error.message}`)
          .setColor(COLORS.RED);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
          await interaction.followUp({ embeds: [embed], ephemeral: true });
        }
      }
    }
  };