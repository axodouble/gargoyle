import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    SectionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder
} from 'discord.js';

export default class User extends GargoyleModule {
    public override category: string = 'utilities';
    public override slashCommands = [
        new GargoyleSlashCommandBuilder()
            .setName('user')
            .setDescription('User related commands')
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('info')
                    .setDescription('Get information about a user')
                    .addUserOption((option) => option.setName('user').setDescription('The user to get information about').setRequired(true))
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('avatar')
                    .setDescription('Get a users avatar')
                    .addUserOption((option) => option.setName('user').setDescription('The user to get the avatar of').setRequired(true))
                    .addStringOption((option) =>
                        option
                            .setName('type')
                            .setDescription('The type of avatar to retrieve')
                            .addChoices({ name: 'Guild', value: 'guild' }, { name: 'Global', value: 'global' })
                            .setRequired(false)
                    )
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('banner')
                    .setDescription('Get a users banner')
                    .addUserOption((option) => option.setName('user').setDescription('The user to get the banner of').setRequired(true))
                    .addStringOption((option) =>
                        option
                            .setName('type')
                            .setDescription('The type of banner to retrieve')
                            .addChoices({ name: 'Guild', value: 'guild' }, { name: 'Global', value: 'global' })
                            .setRequired(false)
                    )
            ) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.options.getSubcommand() === 'info') {
            const user = await client.users.fetch(interaction.options.getUser('user', true), { force: true });
            const member = await interaction.guild?.members.fetch({ user: user.id, force: true });
            await interaction.reply({
                components: [
                    new ContainerBuilder().setAccentColor(user.accentColor ?? 0x161616).addSectionComponents(
                        new SectionBuilder()
                            .setThumbnailAccessory(new ThumbnailBuilder().setURL(user.displayAvatarURL({ size: 4096, extension: 'png' })))
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `# ${user.username} (${user.tag})` +
                                        `\n> **ID**: ${user.id}` +
                                        `\n> **Created**: <t:${Math.floor(user.createdTimestamp / 1000)}:f> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)` +
                                        (member
                                            ? `\n> **Joined**: <t:${Math.floor(member.joinedTimestamp! / 1000)}:f> (<t:${Math.floor(member.joinedTimestamp! / 1000)}:R>)`
                                            : '') +
                                        (user.bot ? `\n> **Bot**: Yes` : `\n> **Bot**: No`) +
                                        (user.flags?.toArray().length
                                            ? `\n> **Badges**: ${user.flags
                                                  .toArray()
                                                  .map((flag) => `\`${flag}\``)
                                                  .join(', ')}`
                                            : '') +
                                        (member?.roles.cache.size
                                            ? `\n> **Roles**: ${member.roles.cache.map((role) => `<@&${role.id}>`).join(', ')}`
                                            : '')
                                )
                            )
                    )
                ],
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
            });
        } else if (interaction.options.getSubcommand() === 'avatar') {
            const type = interaction.options.getString('type') ?? 'global';
            const user = interaction.options.getUser('user', true);
            const member = interaction.guild?.members.cache.get(user.id);
            if (type === 'guild' && member?.avatar) {
                await interaction.reply({
                    components: [
                        new ContainerBuilder()
                            .setAccentColor(0x161616)
                            .addMediaGalleryComponents(
                                new MediaGalleryBuilder().addItems(
                                    new MediaGalleryItemBuilder().setURL(member.avatarURL({ size: 4096, extension: 'png' })!)
                                )
                            )
                    ],
                    flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
                });
            } else {
                await interaction.reply({
                    components: [
                        new ContainerBuilder()
                            .setAccentColor(0x161616)
                            .addMediaGalleryComponents(
                                new MediaGalleryBuilder().addItems(
                                    new MediaGalleryItemBuilder().setURL(user.displayAvatarURL({ size: 4096, extension: 'png' }))
                                )
                            )
                    ],
                    flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
                });
            }
        } else if (interaction.options.getSubcommand() === 'banner') {
            const type = interaction.options.getString('type') ?? 'global';
            const user = await client.users.fetch(interaction.options.getUser('user', true), { force: true });
            const member = await interaction.guild?.members.fetch({ user: user.id, force: true });
            console.log(user.banner);
            if (type === 'guild' && member?.banner) {
                await interaction.reply({
                    components: [
                        new ContainerBuilder()
                            .setAccentColor(0x161616)
                            .addMediaGalleryComponents(
                                new MediaGalleryBuilder().addItems(
                                    new MediaGalleryItemBuilder().setURL(member.bannerURL({ size: 4096, extension: 'png' })!)
                                )
                            )
                    ],
                    flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
                });
            } else if (user.banner) {
                await interaction.reply({
                    components: [
                        new ContainerBuilder()
                            .setAccentColor(0x161616)
                            .addMediaGalleryComponents(
                                new MediaGalleryBuilder().addItems(
                                    new MediaGalleryItemBuilder().setURL(user.bannerURL({ size: 4096, extension: 'png' })!)
                                )
                            )
                    ],
                    flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
                });
            } else {
                await interaction.reply({
                    content: 'User has no banner set',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
}
