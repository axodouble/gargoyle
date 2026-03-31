import GargoyleContainerBuilder from '@src/system/backend/builders/gargoyleContainerBuilder';
import { GargoyleStringSelectMenuBuilder } from '@src/system/backend/builders/gargoyleSelectMenuBuilders';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleTextCommandBuilder from '@src/system/backend/builders/gargoyleTextCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import {
    ActionRowBuilder,
    AnySelectMenuInteraction,
    ChatInputCommandInteraction,
    ClientEvents,
    ContainerBuilder,
    DiscordAPIError,
    Events,
    InteractionReplyOptions,
    Message,
    MessageActionRowComponentBuilder,
    MessageCreateOptions,
    MessageFlags,
    Guild,
    GuildMember,
    PartialGroupDMChannel,
    Role,
    TextDisplayBuilder,
    VoiceBasedChannel
} from 'discord.js';

const KING_ROLE_NAME = 'King of April 2026';
const KING_ROLE_FIX_INTERVAL_MS = 20 * 60 * 1000;
const KING_ROLE_RECONCILE_COOLDOWN_MS = 60 * 1000;
const KING_ROLE_API_DELAY_MS = 500;

export default class AprilFirst extends GargoyleModule {
    public guilds = ['324195889977622530'];
    public override name: string = 'aprilfirst';
    public override category: string = 'fun';

    public kingRoleHolder: string | null = null;
    private isFixKingRoleRunning: boolean = false;
    private nextKingRoleFixAt: number = 0;

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('purchase')
            .setDescription('Purchase things')
            .addGuilds(...this.guilds) as GargoyleSlashCommandBuilder,
        new GargoyleSlashCommandBuilder()
            .setName('april_timeout')
            .setDescription('Timeout a user for 30 minutes (Exclusive to April First)')
            .addGuilds(...this.guilds)
            .addUserOption((option) => option.setName('user').setDescription('The user to timeout').setRequired(true)) as GargoyleSlashCommandBuilder
    ];

    public override textCommands: GargoyleTextCommandBuilder[] = [];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (!client.db) return;

        if (interaction.commandName === 'purchase') {
            await interaction.reply(this.storeUi(interaction.user.id) as InteractionReplyOptions);
        } else if (interaction.commandName === 'april_timeout') {
            const user = await client.db.getAprilFirstUser(interaction.user.id, { exists: true });
            if (user.timeout_30 <= 0) {
                await interaction.reply({
                    content: 'You do not have any timeout purchases left. Please purchase some in the store first.',
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }

            const target = interaction.options.getUser('user', true);
            const member = interaction.guild?.members.cache.get(target.id);
            if (member) {
                try {
                    await member.timeout(30 * 60 * 1000, `Timed out by ${interaction.user.tag} using April First timeout purchase`);
                } catch (error) {
                    if (isIgnorableDiscordApiError(error)) {
                        await interaction.reply({
                            content: 'I do not have permission to timeout that user.',
                            flags: [MessageFlags.Ephemeral]
                        });
                        return;
                    }
                    throw error;
                }
                user.timeout_30 -= 1;
                await client.db.setAprilFirstUser(interaction.user.id, {
                    timeout_30: user.timeout_30
                });
                await interaction.reply({
                    content: `You have successfully timed out ${target.tag} for 30 minutes. You have ${user.timeout_30} timeout purchases left.`,
                    flags: [MessageFlags.Ephemeral]
                });
            } else {
                await interaction.reply({
                    content: 'Could not find the specified user in this guild.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
        }
    }

    public override async executeSelectMenuCommand(client: GargoyleClient, interaction: AnySelectMenuInteraction, ...args: string[]): Promise<void> {
        if (!client.db) return;
        if (args[0] === 'store_select' && args[1] === interaction.user.id) {
            const aprilUser = await client.db.getAprilFirstUser(interaction.user.id, { exists: true });
            const user = await client.db.getUser(interaction.user.id, { exists: true });
            const selectedOption = interaction.values[0];
            let cost = 0;
            switch (selectedOption) {
                case 'message_rights_5':
                    aprilUser.message_rights += 5;
                    cost = 5;
                    break;
                case 'message_rights_25':
                    aprilUser.message_rights += 25;
                    cost = 20;
                    break;
                case 'mention_rights':
                    aprilUser.mention_rights += 5;
                    cost = 10;
                    break;
                case 'timeout_30':
                    aprilUser.timeout_30 += 1;
                    cost = 500;
                    break;
                case 'trophy_role':
                    const role = interaction.guild?.roles.cache.find((r) => r.name === 'I paid $50 and all I got was this lousy role');
                    if (role) {
                        const member = interaction.guild?.members.cache.get(interaction.user.id);
                        if (member && !member.roles.cache.has(role.id)) {
                            await member.roles.add(role);
                            cost = 50;
                        } else {
                            await interaction.update({
                                components: [
                                    new GargoyleContainerBuilder('Could not find your member data or you already have the role. Please try again.')
                                ],
                                flags: [MessageFlags.IsComponentsV2]
                            });
                            return;
                        }
                    } else {
                        await interaction.update({
                            components: [new GargoyleContainerBuilder('Could not find the trophy role. Please contact an administrator.')],
                            flags: [MessageFlags.IsComponentsV2]
                        });
                        return;
                    }
                    break;
                default:
                    await interaction.update({
                        components: [new GargoyleContainerBuilder('Unknown option selected. Please try again.')],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                    return;
            }
            if (user.balance < cost) {
                await interaction.update({
                    content:
                        `You do not have enough balance to purchase ${selectedOption.replace('_', ' ')}. Your current balance is $${user.balance}.\n` +
                        `You can earn more money by running \`/economy daily\`, playing \`/economy blackjack\` or hanging out in VCs to earn passive income!`,
                    components: [],
                    flags: [MessageFlags.IsComponentsV2]
                });
                return;
            }
            user.balance -= cost;
            await client.db.setAprilFirstUser(interaction.user.id, {
                message_rights: aprilUser.message_rights,
                mention_rights: aprilUser.mention_rights,
                timeout_30: aprilUser.timeout_30,
                amount_spent: aprilUser.amount_spent + cost
            });
            await client.db.setUser(interaction.user.id, {
                balance: user.balance
            });

            await interaction.update({
                components: [
                    new GargoyleContainerBuilder(
                        `You have successfully purchased ${selectedOption.replace('_', ' ')} for $${cost}. Your new balance is $${user.balance}.`
                    )
                ],
                flags: [MessageFlags.IsComponentsV2]
            });
        } else {
            await interaction.reply({
                content: 'This is not your message!',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }

    private storeUi(user: string): MessageCreateOptions {
        return {
            components: [
                new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${StoreEmojis.Store} Store`))
                    .addActionRowComponents(
                        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                            new GargoyleStringSelectMenuBuilder(this, 'store_select', user)
                                .setPlaceholder('Select something to purchase')
                                .setMinValues(1)
                                .setMaxValues(1)
                                .setRequired(true)
                                .addOptions([
                                    {
                                        label: 'Message Rights x 5 - $5',
                                        value: 'message_rights_5'
                                    },
                                    {
                                        label: 'Message Rights x 25 - $20',
                                        value: 'message_rights_25'
                                    },
                                    {
                                        label: 'Mention Rights x 5 - $10',
                                        value: 'mention_rights'
                                    },
                                    {
                                        label: 'Timeout User for 30 minutes - $500',
                                        value: 'timeout_30'
                                    },
                                    {
                                        label: 'Trophy Role (Exclusive to April First) - $50',
                                        value: 'trophy_role'
                                    }
                                ])
                        )
                    )
            ],
            flags: [MessageFlags.IsComponentsV2]
        } as MessageCreateOptions;
    }

    public override events: GargoyleEvent[] = [new AprilFirstMessage(this)];

    public override init(client: GargoyleClient): void {
        // Execute after 15 seconds to allow the client to load all commands and events
        setTimeout(() => {
            client.logger.info('April First module initialized. Fetching channels for specified guilds...');
            for (const guild of this.guilds) {
                client.guilds.cache.get(guild)?.channels.fetch();
            }
        }, 15000);

        // Voice activity
        this.rewardVoiceActivity(client);
        setInterval(
            () => {
                this.rewardVoiceActivity(client);
            },
            5 * 60 * 1000
        );

        // Fix king role
        void this.scheduleKingRoleFix(client);
        setInterval(
            () => {
                void this.scheduleKingRoleFix(client);
            },
            KING_ROLE_FIX_INTERVAL_MS
        );

        // Announce king role holder every hour in the general channel of each guild
        this.announceKingRoleHolder(client);
        setInterval(
            async () => {
                this.announceKingRoleHolder(client);
            },
            60 * 60 * 1000
        );
    }

    private announceKingRoleHolder(client: GargoyleClient): void {
        for (const guildId of this.guilds) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const generalChannel = guild.channels.cache.find((c) => c.name.toLowerCase().includes('general') && c.isTextBased());
            if (!generalChannel || !generalChannel.isTextBased()) {
                client.logger.warning(
                    `Could not find a general text channel in guild ${guildId} to announce the current king role holder. Skipping...`
                );
                continue;
            }

            if (this.kingRoleHolder) {
                generalChannel.send({
                    content: `The current King of April 2026 is <@!${this.kingRoleHolder}>. Long live the king!`
                });
            } else {
                client.logger.error(`No current king role holder found for guild ${guildId} when attempting to announce. Skipping announcement...`);
            }
        }
    }

    private async scheduleKingRoleFix(client: GargoyleClient): Promise<void> {
        if (this.isFixKingRoleRunning) {
            client.logger.debug(`${KING_ROLE_NAME} reconciliation is already running; skipping duplicate invocation.`);
            return;
        }

        if (Date.now() < this.nextKingRoleFixAt) {
            client.logger.debug(`Skipping ${KING_ROLE_NAME} reconciliation due to cooldown.`);
            return;
        }

        this.isFixKingRoleRunning = true;
        try {
            await this.fixKingRole(client);
        } finally {
            this.isFixKingRoleRunning = false;
            this.nextKingRoleFixAt = Date.now() + KING_ROLE_RECONCILE_COOLDOWN_MS;
        }
    }

    private async fixKingRole(client: GargoyleClient): Promise<void> {
        for (const guildId of this.guilds) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            await guild.roles.fetch();
            const kingRole = guild.roles.cache.find((r) => r.name === KING_ROLE_NAME);
            if (!kingRole) {
                client.logger.error(`Could not find ${KING_ROLE_NAME} role in guild ${guildId}. Skipping...`);
                continue;
            }

            const fetchedRole = await guild.roles.fetch(kingRole.id);
            if (!fetchedRole) {
                client.logger.error(`Failed to fetch ${KING_ROLE_NAME} role in guild ${guildId}. Skipping...`);
                continue;
            }

            const currentKing = fetchedRole.members.first();

            if (currentKing) {
                const didReconcile = await this.enforceSingleKingRoleHolder(client, fetchedRole, currentKing.id);
                if (!didReconcile) {
                    continue;
                }
                client.logger.info(`Found ${KING_ROLE_NAME} holder: ${this.kingRoleHolder}`);
                break;
            } else {
                const generalChannel = guild.channels.cache.find((c) => c.name.toLowerCase().includes('general'));

                if (!generalChannel || !generalChannel.isTextBased()) {
                    client.logger.warning(
                        `Could not find a general text channel in guild ${guildId} to send a message about the missing king role holder. Skipping...`
                    );
                    continue;
                }

                // Assign role to a random member and announce it in the general channel
                const randomMember = await this.getRandomNonBotMember(guild);
                if (randomMember) {
                    const didAssign = await this.enforceSingleKingRoleHolder(client, fetchedRole, randomMember.id);
                    if (!didAssign) {
                        continue;
                    }

                    client.logger.info(
                        `Assigned ${KING_ROLE_NAME} role to ${randomMember.user.tag} in guild ${guildId} as no current holder was found.`
                    );
                    await generalChannel.send({
                        content: `The ${KING_ROLE_NAME} role had no holder, so it has been assigned to <@!${randomMember.user.id}>. Long live the king!`
                    });
                } else {
                    client.logger.warning(
                        `Could not find any non-bot members in guild ${guildId} to assign the ${KING_ROLE_NAME} role to. Skipping...`
                    );
                }
            }
        }
    }

    private async getRandomNonBotMember(guild: Guild): Promise<GuildMember | null> {
        const cachedMember = guild.members.cache.filter((member) => !member.user.bot).random();
        if (cachedMember) {
            return cachedMember;
        }

        try {
            const owner = await guild.fetchOwner();
            if (!owner.user.bot) {
                return owner;
            }
        } catch {
            // Ignore and allow caller to handle the missing candidate.
        }

        return null;
    }

    public async enforceSingleKingRoleHolder(client: GargoyleClient, kingRole: Role, memberId: string): Promise<boolean> {
        const guild = kingRole.guild;

        const targetMember =
            guild.members.cache.get(memberId) ??
            (await guild.members.fetch(memberId).catch((error) => {
                client.logger.warning(
                    `Failed to fetch target member ${memberId} in guild ${guild.id} while reconciling ${KING_ROLE_NAME}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                return null;
            }));

        if (!targetMember) {
            client.logger.warning(`Could not find target member ${memberId} in guild ${guild.id} while reconciling ${KING_ROLE_NAME}.`);
            return false;
        }

        const membersWithRole = Array.from(kingRole.members.values());
        for (const member of membersWithRole) {
            if (member.id === targetMember.id) continue;

            try {
                await member.roles.remove(kingRole);
                client.logger.info(`Removed ${KING_ROLE_NAME} role from ${member.user.tag} in guild ${guild.id} to enforce a single holder.`);
            } catch (error) {
                if (!isIgnorableDiscordApiError(error)) {
                    client.logger.error(
                        `Failed to remove ${KING_ROLE_NAME} role from ${member.user.tag} in guild ${guild.id}: ${error instanceof Error ? error.message : String(error)}`
                    );
                    return false;
                }
            }

            await sleep(KING_ROLE_API_DELAY_MS);
        }

        if (!targetMember.roles.cache.has(kingRole.id)) {
            try {
                await targetMember.roles.add(kingRole);
            } catch (error) {
                if (isIgnorableDiscordApiError(error)) {
                    return false;
                }

                client.logger.error(
                    `Failed to assign ${KING_ROLE_NAME} role to ${targetMember.user.tag} in guild ${guild.id}: ${error instanceof Error ? error.message : String(error)}`
                );
                return false;
            }

            await sleep(KING_ROLE_API_DELAY_MS);
        }

        this.kingRoleHolder = targetMember.id;
        return true;
    }

    /**
     * Rewards users at a rate of $5 every minute for being in a voice channel in the specified guilds.
     */
    private async rewardVoiceActivity(client: GargoyleClient): Promise<void> {
        for (const voiceChannel of client.channels.cache.filter((c) => !c.isDMBased() && this.guilds.includes(c.guildId) && c.isVoiceBased())) {
            for (const [_, member] of (voiceChannel[1] as VoiceBasedChannel).members) {
                if (member.user.bot) continue;

                if (!client.db) return;

                client.logger.debug(`Rewarding ${member.user.tag} for being in a voice channel.`);
                const user = await client.db.getUser(member.user.id, { exists: true });
                await client.db.setUser(member.user.id, {
                    balance: user.balance + 25
                });
            }
        }
    }
}

class AprilFirstMessage extends GargoyleEvent {
    private module: AprilFirst;
    constructor(module: AprilFirst) {
        super();
        this.module = module;
    }

    public override event: keyof ClientEvents = Events.MessageCreate as const;
    public override async execute(client: GargoyleClient, message: Message, ..._args: any[]): Promise<void> {
        if (message.guildId && !this.module.guilds.includes(message.guildId)) return;
        if (!message.member || message.member?.user.bot || !client.db) return;

        if (message.channel instanceof PartialGroupDMChannel) return;

        const user = await client.db.getAprilFirstUser(message.member.user.id, { exists: true });

        if (message.mentions.members) {
            if (message.mentions.members.size > user.mention_rights) {
                try {
                    await message.delete();
                } catch (error) {
                    if (!isIgnorableDiscordApiError(error)) {
                        throw error;
                    }
                }
                try {
                    await message.channel
                        .send({
                            content:
                                `<@!${message.member.id}>, you have exceeded your mention rights and your message has been deleted.` +
                                `\nBuy more mention rights in the store to avoid this in the future.` +
                                `\n-# \`/purchase\` in the store to buy more mention rights.`,
                            allowedMentions: { users: [] }
                        })
                        .then((sentMessage) => {
                            setTimeout(() => {
                                sentMessage.delete().catch((error) => {
                                    if (!isIgnorableDiscordApiError(error)) {
                                        client.logger.error('Failed to delete store warning message:', error);
                                    }
                                });
                            }, 15000);
                        });
                } catch (error) {
                    if (!isIgnorableDiscordApiError(error)) {
                        throw error;
                    }
                }
                user.mention_rights = Math.max(user.mention_rights - message.mentions.members.size, 0);
                await client.db.setAprilFirstUser(message.member.user.id, {
                    mention_rights: user.mention_rights
                });
                return;
            }
            user.mention_rights = Math.max(user.mention_rights - message.mentions.members.size, 0);
            await client.db.setAprilFirstUser(message.member.user.id, {
                mention_rights: user.mention_rights
            });
        }

        if (user.message_rights <= 0) {
            try {
                await message.delete();
            } catch (error) {
                if (!isIgnorableDiscordApiError(error)) {
                    throw error;
                }
            }
            try {
                await message.channel.send({
                    content:
                        `<@!${message.member.id}>, you have no message rights left and your message has been deleted.` +
                        `\nBuy more message rights in the store to avoid this in the future.` +
                        `\n-# \`/purchase\` in the store to buy more message rights.`
                });
            } catch (error) {
                if (!isIgnorableDiscordApiError(error)) {
                    throw error;
                }
            }
            return;
        }

        user.message_rights = Math.max(user.message_rights - 1, 0);
        await client.db.setAprilFirstUser(message.member.user.id, {
            message_rights: user.message_rights
        });

        if (message.mentions.users.size <= 0) return;

        if (!message.mentions.users.some((u) => u.id === this.module.kingRoleHolder)) return;

        const kingRole = message.guild?.roles.cache.find((r) => r.name === KING_ROLE_NAME);
        if (!kingRole) return;

        const member = message.guild?.members.cache.get(message.member.id);
        if (!member) return;

        const previousKingRoleHolder = this.module.kingRoleHolder;
        const didTransfer = await this.module.enforceSingleKingRoleHolder(client, kingRole, member.id);
        if (!didTransfer) {
            return;
        }

        try {
            await message.reply({
                content: `You have stolen the crown from <@!${previousKingRoleHolder ?? 'Unknown'}> and are now the new King!`,
                allowedMentions: { users: [] }
            });
        } catch (error) {
            if (!isIgnorableDiscordApiError(error)) {
                throw error;
            }
        }
    }
}

function isIgnorableDiscordApiError(error: unknown): boolean {
    if (!(error instanceof DiscordAPIError)) {
        return false;
    }

    return error.code === 50013 || error.code === 10008;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

enum StoreEmojis {
    'Store' = '<:storefront:1483343803346587770>'
}
