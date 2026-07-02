import GargoyleContainerBuilder from '@src/system/backend/builders/gargoyleContainerBuilder';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

export default class Daily extends GargoyleModule {
    public override name: string = 'daily';
    public override category: string = 'economy';
    public override slashCommands = [
        new GargoyleSlashCommandBuilder().setName(this.name).setDescription('Claim your daily reward') as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (!client.db) {
            void interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            client.logger.error('Database not connected when executing daily command.');
            return;
        }

        const guildUser = await client.db.getGuildUser(interaction.user.id, interaction.guildId!, { exists: true });
        const user = await client.db.getUser(interaction.user.id, { exists: true });

        const now = new Date();
        const lastDaily = new Date(guildUser.last_daily);
        if (lastDaily.getTime() > 0) {
            if (lastDaily.getDate() === now.getDate() && lastDaily.getMonth() === now.getMonth() && lastDaily.getFullYear() === now.getFullYear()) {
                await interaction.reply({
                    components: [
                        new GargoyleContainerBuilder(
                            'You have already claimed your daily reward today!\n-# You can claim a daily reward in every guild you are in, so try claiming in another server if you want more rewards!'
                        )
                    ],
                    flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
                });
                return;
            } else if (
                // If the last daily was in the last 36 hours, we consider it a streak. This allows for some flexibility in claiming times.
                now.getTime() - lastDaily.getTime() <= 36 * 60 * 60 * 1000
            ) {
                guildUser.daily_streak += 1;
            } else {
                guildUser.daily_streak = 1;
            }
        } else {
            guildUser.daily_streak = 1;
        }
        const dailyAmount = 50 + guildUser.daily_streak * 15;
        user.balance += dailyAmount;
        client.logger.trace(`User ${interaction.user.id} claimed daily reward of $${dailyAmount} with a streak of ${guildUser.daily_streak}.`);
        guildUser.last_daily = now;

        await client.db.setUser(interaction.user.id, {
            balance: user.balance
        });
        await client.db.setGuildUser(interaction.user.id, interaction.guildId!, {
            last_daily: guildUser.last_daily,
            daily_streak: guildUser.daily_streak
        });

        await interaction.reply({
            components: [
                new GargoyleContainerBuilder(
                    `You have claimed your daily reward of $${dailyAmount.toLocaleString()}! Your current streak is ${guildUser.daily_streak} days.` +
                        `\n-# You can claim a daily reward multiple times in every guild you are in, so try claiming in another server if you want more rewards!`
                )
            ],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
}
