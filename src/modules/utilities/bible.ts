import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import { fetch } from 'bun';
import { ChatInputCommandInteraction, ContainerBuilder, TextChannel, TextDisplayBuilder } from 'discord.js';

export default class Bible extends GargoyleModule {
    public override name: string = 'bible';
    public override category: string = 'utilities';

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder().setName('bible').setDescription('Get a random verse from the Bible')
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const data = await fetch('https://discoverybiblestudy.org/daily/api/');

            if (!data.ok) {
                await interaction.reply({ content: 'Failed to fetch a verse from the Bible. Please try again later.', ephemeral: true });
                return;
            }

            const verseData = (await data.json()) as { text: string; ref: string };

            await interaction.reply({ content: `**${verseData.ref}**\n${verseData.text.replaceAll('&quot;', '"')}` });
        } catch (error) {
            client.logger.error(`Error fetching a verse from the Bible: ${error}`);
            await interaction.reply({ content: 'An error occurred while fetching a verse from the Bible. Please try again later.', ephemeral: true });
        }
    }

    public override init(client: GargoyleClient): void {
        let lastDone = 0;
        setInterval(
            async () => {
                const now = new Date();
                const perthTime = now.toLocaleString('en-AU', { timeZone: 'Australia/Perth', dateStyle: 'short', timeStyle: 'short', hour12: false });
                if (perthTime.includes(`07:00`) && Date.now() - lastDone > 60 * 1000) {
                    const data = await fetch('https://discoverybiblestudy.org/daily/api/');

                    if (!data.ok) {
                        client.logger.error('Failed to fetch a verse from the Bible for daily update.');
                        return;
                    }

                    const verseData = (await data.json()) as { text: string; ref: string };

                    const channel = (await client.channels.fetch('1468918008901533849')) as TextChannel | null;
                    if (!channel) {
                        client.logger.error('Failed to fetch the channel for daily Bible verse update.');
                        return;
                    }
                    await channel.send({
                        components: [
                            new ContainerBuilder().addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `**${verseData.ref}**\n${verseData.text.replaceAll('&quot;', '"')}\n-# <@&1468918715448819743>`
                                )
                            )
                        ]
                    });
                    lastDone = Date.now();
                }
            },
            1 * 60 * 1000
        );
    }
}
