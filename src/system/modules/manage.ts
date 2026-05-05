import GargoyleTextCommandBuilder from '@builders/gargoyleTextCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import {
    ButtonInteraction,
    ChatInputCommandInteraction,
    ContainerBuilder,
    LabelBuilder,
    Message,
    MessageFlags,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle,
    ThumbnailBuilder
} from 'discord.js';
import GargoyleSlashCommandBuilder from '../backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleEvent from '../backend/classes/gargoyleEvent.js';
import GargoyleModalBuilder from '../backend/builders/gargoyleModalBuilder.js';

export default class Manage extends GargoyleModule {
    public override name: string = 'manage';
    override category: string = 'base';
    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('manage')
            .setDescription('Manage the bot and support')
            .addGuild('750209335841390642')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .setPrivate(true)
            .addSubcommandGroup((group) =>
                group
                    .setName('support')
                    .setDescription('Support commands')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('guilds')
                            .setDescription('List all guilds the bot is in')
                            .addStringOption((option) => option.setName('filter').setDescription('Filter guilds by name'))
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('guild')
                            .setDescription('Show information about a specific guild')
                            .addStringOption((option) => option.setName('filter').setDescription('Filter guilds by name or ID').setRequired(true))
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('whois')
                            .setDescription('Find a user by ID')
                            .addStringOption((option) => option.setName('id').setDescription('The user ID').setRequired(true))
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('contact')
                            .setDescription('Contact a user for proactive support')
                            .addStringOption((option) => option.setName('id').setDescription('The user ID').setRequired(true))
                    )
            ) as GargoyleSlashCommandBuilder
    ];
    override textCommands = [
        new GargoyleTextCommandBuilder().setName('manage').setDescription('Management').addAlias('mgmt').setPrivate(true),
        new GargoyleTextCommandBuilder().setName('whois').setDescription('Who is this?').setPrivate(true)
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.commandName === 'manage') {
            if (interaction.options.getSubcommandGroup() === 'support') {
                if (interaction.options.getSubcommand() === 'guilds') {
                    const guilds = await client.guilds.fetch();
                    const filter = interaction.options.getString('filter');

                    let guildList = '';
                    for (const guild of guilds) {
                        if (filter && !guild[1].name.toLowerCase().includes(filter.toLowerCase())) continue;
                        guildList += guild[1].name + ' (ID: ' + guild[1].id + ')\n';
                    }

                    if (guildList.length > 2000) {
                        const buffer = Buffer.from(guildList, 'utf-8');
                        await interaction.reply({
                            content: 'Guild list is too long, sending as a file.',
                            files: [{ attachment: buffer, name: 'guilds.txt' }],
                            flags: [MessageFlags.Ephemeral]
                        });
                    } else await interaction.reply({ content: guildList || 'No guilds found.', flags: [MessageFlags.Ephemeral] });
                } else if (interaction.options.getSubcommand() === 'guild') {
                    const filter = interaction.options.getString('filter', true);
                    const guilds = await client.guilds.fetch();
                    const guild = Array.from(guilds.values()).find((g) => g.name.toLowerCase().includes(filter.toLowerCase()) || g.id === filter);

                    if (!guild) {
                        await interaction.reply({ content: 'No guild found with that name or ID.', flags: [MessageFlags.Ephemeral] });
                        return;
                    }

                    const cachedGuild = client.guilds.cache.get(guild.id);

                    if (!cachedGuild) {
                        await interaction.reply({ content: 'Guild not found in cache.', flags: [MessageFlags.Ephemeral] });
                        return;
                    }

                    const invites = (
                        await cachedGuild.invites.fetch().catch(() => {
                            return null;
                        })
                    )
                        ?.map((invite) => invite.code)
                        .join(', ');

                    const guildOwner = await cachedGuild.fetchOwner().catch(() => null);

                    await interaction.reply({
                        components: [
                            new ContainerBuilder().addSectionComponents(
                                new SectionBuilder()
                                    .setThumbnailAccessory(
                                        new ThumbnailBuilder().setURL(guild.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png')
                                    )
                                    .addTextDisplayComponents(
                                        new TextDisplayBuilder().setContent(
                                            `Guild Name: ${cachedGuild.name}\nGuild ID: ${cachedGuild.id}\nGuild Owner: ${cachedGuild.ownerId} (${guildOwner?.user.username || 'Unknown'})\nMember Count: ${cachedGuild.memberCount}\nGuild Features: ${cachedGuild.features}\n${invites ? `Invites: ${invites}` : ''}`
                                        )
                                    )
                            )
                        ],
                        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
                    });
                } else if (interaction.options.getSubcommand() === 'whois') {
                    const userId = interaction.options.getString('id', true);
                    const user = await client.users.fetch(userId).catch((err) => {
                        interaction.reply({ content: `Error trying to find user: \`${err.message}\``, flags: [MessageFlags.Ephemeral] });
                        return;
                    });

                    const guildsWithUser = [];
                    const guilds = await client.guilds.fetch();
                    for (const guild of guilds.values()) {
                        const member = await client.guilds.cache
                            .get(guild.id)
                            ?.members.fetch(userId)
                            .catch(() => null);
                        if (member) {
                            guildsWithUser.push(guild.name);
                        }
                    }

                    if (user) {
                        await interaction.reply({
                            content: `User: ${user.tag}\nID: ${user.id}\nGuilds: ${guildsWithUser.join(', ') || 'None'}`,
                            flags: [MessageFlags.Ephemeral]
                        });
                    }
                }
            }
        } else {
            await interaction.reply({ content: 'Unknown command.', flags: [MessageFlags.Ephemeral] });
        }
    }

    public override async executeButtonCommand(client: GargoyleClient, interaction: ButtonInteraction, ...args: string[]): Promise<void> {
        if (args[0] === 'send') {
            const username =
                client.users.cache.get(args[1])?.tag ||
                (await client.users
                    .fetch(args[1])
                    .then((u) => u.tag)
                    .catch(() => 'Unknown User'));
            await interaction.showModal(
                new GargoyleModalBuilder(this, 'send', args[1])
                    .setTitle(`Send Message to ${username}`)
                    .addLabelComponents(
                        new LabelBuilder()
                            .setLabel('Message')
                            .setTextInputComponent(
                                new TextInputBuilder()
                                    .setCustomId('message')
                                    .setMaxLength(1500)
                                    .setRequired(true)
                                    .setPlaceholder('Enter your message here')
                                    .setStyle(TextInputStyle.Paragraph)
                            )
                    )
            );
        }
    }

    public override async executeModalCommand(client: GargoyleClient, interaction: ModalSubmitInteraction, ...args: string[]): Promise<void> {
        if (args[0] === 'send') {
            const user = client.users.cache.get(args[1]) || (await client.users.fetch(args[1]).catch(() => null));
            if (!user) {
                await interaction.reply({ content: 'User not found.', flags: [MessageFlags.Ephemeral] });
                return;
            }

            const message = interaction.fields.getTextInputValue('message');
            const dmChannel = await user.createDM().catch(() => null);
            if (!dmChannel) {
                await interaction.reply({ content: 'Failed to create DM channel with user.', flags: [MessageFlags.Ephemeral] });
                return;
            }

            await dmChannel
                .send({
                    components: [
                        new ContainerBuilder()
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent('You have a new message from Ceraia support:'))
                            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
                    ],
                    flags: [MessageFlags.IsComponentsV2]
                })
                .catch(async (err) => {
                    await interaction.reply({ content: `Failed to send message to user: \`${err.message}\``, flags: [MessageFlags.Ephemeral] });
                    return;
                });

            await interaction.reply({
                components: [
                    new ContainerBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Message sent to ${user.tag} (ID: ${user.id})`))
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
                ],
                flags: [MessageFlags.IsComponentsV2]
            });
        }
    }

    public override async executeTextCommand(client: GargoyleClient, message: Message, ...args: string[]): Promise<void> {
        if (message.author.id !== '244173330431737866') return;
        if (args[0] === 'whois') {
            const user = await client.users.fetch(args[1]).catch(async (err) => {
                await message.reply(`Error trying to find user: \`${err.message}\``);
                return;
            });

            if (user) await message.reply(`User: ${user.tag}\nID: ${user.id}`);
        } else if (args[0] === 'manage' || args[0] === 'mgmt') {
            if (args.length > 1) {
                if (args[1] === 'guilds') {
                    const guilds = await client.guilds.fetch();
                    let guildList = '';
                    for (const guild of guilds) {
                        guildList += client.guilds.cache.get(guild[0])?.name + '\n';
                    }

                    message.member?.send(guildList);
                }
            }
        }
    }

    public override events: GargoyleEvent[] = [];
}
