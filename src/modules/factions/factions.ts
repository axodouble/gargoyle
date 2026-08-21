import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import {
    ApplicationIntegrationType,
    ButtonInteraction,
    ChannelType,
    ChatInputCommandInteraction,
    InteractionContextType,
    MessageFlags,
    ModalSubmitInteraction
} from 'discord.js';
import { GUILD_ID } from './_types.js';
import { createFaction, getFactionByName } from './_db.js';
import { isFactionLeaderOrAdmin } from './_permissions.js';
import { handleQuestionButton, handleQuestionModal, handleQuestionsCommand } from './_questions.js';

export default class Factions extends GargoyleModule {
    public override name: string = 'factions';
    public override category: string = 'factions';

    public override slashCommands = [
        new GargoyleSlashCommandBuilder()
            .setName('faction')
            .setDescription('Faction application management')
            .setContexts(InteractionContextType.Guild)
            .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
            .addGuild(GUILD_ID)
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('setup')
                    .setDescription('Create a new faction')
                    .addStringOption((option) => option.setName('name').setDescription('Faction name').setRequired(true))
                    .addStringOption((option) => option.setName('description').setDescription('Shown on the apply button').setRequired(false))
                    .addRoleOption((option) => option.setName('leader-role').setDescription('Role of the faction leaders').setRequired(true))
                    .addChannelOption((option) =>
                        option
                            .setName('channel')
                            .setDescription('Channel where application threads are created')
                            .addChannelTypes(ChannelType.GuildText)
                            .setRequired(true)
                    )
                    .addRoleOption((option) => option.setName('accept-role').setDescription('Role given on acceptance').setRequired(false))
                    .addRoleOption((option) => option.setName('deny-role').setDescription('Role given on denial').setRequired(false))
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('questions')
                    .setDescription('View and edit faction application questions')
                    .addStringOption((option) => option.setName('faction').setDescription('Faction name').setRequired(true))
            )
    ] as GargoyleSlashCommandBuilder[];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.guildId !== GUILD_ID) {
            await interaction.reply({ content: 'This command can only be used in Brads Faction Discord.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        if (!client.db) {
            await interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        if (!interaction.guild) {
            await interaction.reply({ content: 'This can only be used in a guild.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!(await isFactionLeaderOrAdmin(client, interaction.guild, member))) {
            await interaction.reply({
                content: 'You need to be a faction leader or an administrator to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const name = interaction.options.getString('name', true);
            const existing = await getFactionByName(client, GUILD_ID, name);
            if (existing) {
                await interaction.reply({ content: 'A faction with that name already exists.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const channel = interaction.options.getChannel('channel', true);
            if (!channel || channel.type !== ChannelType.GuildText) {
                await interaction.reply({ content: 'The channel must be a text channel.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const leaderRole = interaction.options.getRole('leader-role', true);
            await createFaction(client, {
                guild_id: GUILD_ID,
                name,
                description: interaction.options.getString('description') ?? '',
                leader_role_id: leaderRole.id,
                application_channel_id: channel.id,
                accept_role_id: interaction.options.getRole('accept-role')?.id ?? null,
                deny_role_id: interaction.options.getRole('deny-role')?.id ?? null
            });
            await interaction.reply({
                content: `Faction **${name}** created. Add application questions with /faction questions ${name}.`,
                flags: [MessageFlags.Ephemeral]
            });
            return;
        }

        if (subcommand === 'questions') {
            await handleQuestionsCommand(client, this, interaction);
        }
    }

    public override async executeButtonCommand(client: GargoyleClient, interaction: ButtonInteraction, ...args: string[]): Promise<void> {
        if (!client.db) {
            await interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        if (args[0] === 'qadd' || args[0] === 'qedit' || args[0] === 'qdel' || args[0] === 'qmove') {
            await handleQuestionButton(client, this, interaction, args[0], args[1], args[2], args[3]);
        }
    }

    public override async executeModalCommand(client: GargoyleClient, interaction: ModalSubmitInteraction, ...args: string[]): Promise<void> {
        if (!client.db) {
            await interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        if (args[0] === 'qadd' || args[0] === 'qedit') {
            await handleQuestionModal(client, this, interaction, args[0], args[1], args[2]);
        }
    }
}
