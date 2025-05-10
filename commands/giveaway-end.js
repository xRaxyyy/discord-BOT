const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
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
        .setName('giveaway-end')
        .setDescription('End a giveaway early and pick winners')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The message ID of the giveaway to end')
                .setRequired(true)),

    async execute(interaction) {
        if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
            const embed = new EmbedBuilder()
                .setDescription('❌ You need the giveaway admin role to use this command.')
                .setColor(COLORS.RED);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const messageId = interaction.options.getString('message_id');

        try {
            const giveawayData = interaction.client.activeGiveaways.get(messageId);
            
            if (!giveawayData) {
                const embed = new EmbedBuilder()
                    .setDescription('❌ Could not find an active giveaway with that ID. It may have already ended.')
                    .setColor(COLORS.RED);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const channel = giveawayData.channel || interaction.channel;
            const giveawayMessage = await channel.messages.fetch(messageId);

            if (!giveawayMessage.embeds[0] || !giveawayMessage.components[0]) {
                const embed = new EmbedBuilder()
                    .setDescription('❌ The specified message is not a valid giveaway.')
                    .setColor(COLORS.RED);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const confirmEmbed = new EmbedBuilder()
                .setDescription('⚠️ Are you sure you want to end this giveaway early?')
                .setColor(COLORS.ORANGE);

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_end')
                    .setLabel('End Giveaway')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_end')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

            const confirmMessage = await interaction.reply({
                embeds: [confirmEmbed],
                components: [confirmRow],
                ephemeral: true,
                fetchReply: true
            });

            const collector = confirmMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 30_000
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    const embed = new EmbedBuilder()
                        .setDescription('❌ Only the command initiator can confirm this action.')
                        .setColor(COLORS.RED);
                    return i.reply({ embeds: [embed], ephemeral: true });
                }

                if (i.customId === 'cancel_end') {
                    collector.stop();
                    const embed = new EmbedBuilder()
                        .setDescription('✅ Cancelled ending the giveaway.')
                        .setColor(COLORS.GREEN);
                    return i.update({ embeds: [embed], components: [] });
                }

                if (i.customId === 'confirm_end') {
                    collector.stop();
                    await endGiveawayManually(giveawayMessage, interaction, giveawayData);

                    const embed = new EmbedBuilder()
                        .setDescription('✅ Giveaway ended successfully!')
                        .setColor(COLORS.GREEN);
                    return i.update({ embeds: [embed], components: [] });
                }
            });

            collector.on('end', (_, reason) => {
                if (reason === 'time') {
                    interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setDescription('❌ Confirmation timed out. Giveaway was not ended.')
                            .setColor(COLORS.RED)],
                        components: []
                    });
                }
            });

        } catch (error) {
            console.error('Error ending giveaway:', error);
            const embed = new EmbedBuilder()
                .setDescription('❌ Could not find a giveaway with that message ID in this channel.')
                .setColor(COLORS.RED);
            interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};

async function endGiveawayManually(giveawayMessage, interaction, giveawayData) {
    try {
        const { collector, entries, prize, winnersCount, channel } = giveawayData;

        if (collector && !collector.ended) {
            collector.stop('manual_end');
        }

        interaction.client.activeGiveaways.delete(giveawayMessage.id);

        const participants = Array.from(entries.values());
        const now = new Date();
        const endedAt = formatTimeWithTodayTomorrow(now);

        if (participants.length === 0) {
            const noEntriesEmbed = new EmbedBuilder()
                .setTitle(`🎊 **GIVEAWAY ENDED** 🎊`)
                .setDescription(`No one entered the giveaway of **${prize}**!`)
                .setColor(COLORS.RED)
                .setFooter({ text: `Ended at | ${endedAt}` });

            await giveawayMessage.edit({
                content: '',
                embeds: [noEntriesEmbed],
                components: []
            });

            return;
        }

        const winners = [];
        const participantsCopy = [...participants];
        for (let i = 0; i < winnersCount && participantsCopy.length > 0; i++) {
            const winnerIndex = Math.floor(Math.random() * participantsCopy.length);
            winners.push(participantsCopy.splice(winnerIndex, 1)[0]);
        }

        const winnersEmbed = new EmbedBuilder()
            .setColor(COLORS.GREEN)
            .setTitle(`🎊 **GIVEAWAY ENDED** 🎊`)
            .setDescription(`The winner${winners.length > 1 ? 's' : ''} of **${prize}** ${winners.length > 1 ? 'are' : 'is'} ${winners.map(w => `<@${w.id}>`).join(', ')}. Congrats! 🎉`)
            .setFooter({
                text: `Giveaway ended at ${endedAt}`,
                iconURL: interaction.user.displayAvatarURL()
            });

        await giveawayMessage.edit({
            content: '',
            embeds: [winnersEmbed],
            components: []
        });

    } catch (error) {
        console.error('Error ending giveaway manually:', error);
        await interaction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setDescription('❌ Failed to end the giveaway properly. Please try again.')
                    .setColor(COLORS.RED)
            ],
            ephemeral: true
        });
    }
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