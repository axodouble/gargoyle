import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { $, fetch } from 'bun';
import { UUID } from 'crypto';
import { ApplicationIntegrationType, AttachmentBuilder, ChatInputCommandInteraction, ClientEvents, Events, InteractionContextType, Message } from 'discord.js';
import { closest, distance } from 'fastest-levenshtein';
import { tmpdir } from 'os';
import path from 'path';
import { fileExistsSync } from 'tsconfig-paths/lib/filesystem';

type SlimCard = {
    id: string;
    name: string;
    set: string;
    set_name: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'special' | 'mythic' | 'bonus';
    type_line: string | undefined; // Some cards (tokens, art cards, etc.) may omit this
    booster: boolean;
    digital: boolean;
    image_uris?: { normal: string };
    card_faces?: { name: string; image_uris?: { normal: string } }[];
};

type BoosterPool = {
    commons: SlimCard[];
    uncommons: SlimCard[];
    rares: SlimCard[];
    mythics: SlimCard[];
    lands: SlimCard[];
};

export default class Magic extends GargoyleModule {
    public override name: string = 'magic';
    public override category: string = 'utilities';

    public cardMap: Map<string, SlimCard> = new Map();
    private cardNames: string[] = [];
    private setIndex: Map<string, BoosterPool> = new Map();
    private boosterSets: string[] = [];
    private allCards: SlimCard[] = [];

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('magic')
            .setDescription('Magic: the Gathering commands')
            .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
            .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
            .addSubcommand((s) =>
                s
                    .setName('card')
                    .setDescription('Get a card')
                    .addStringOption((n) => n.setName('name').setDescription('The name of the card').setRequired(true))
            )
            .addSubcommand((s) => s.setName('random').setDescription('Get a random card'))
            .addSubcommand((s) =>
                s
                    .setName('booster')
                    .setDescription('Open a booster pack')
                    .addStringOption((n) =>
                        n.setName('set').setDescription('Set code (random if omitted)').setRequired(false)
                    )
            )
            .addSubcommand((s) =>
                s
                    .setName('chaosdraft')
                    .setDescription('Generate a chaos draft pool — each player gets packs from random sets')
                    .addIntegerOption((n) =>
                        n.setName('players').setDescription('Number of players (default 8, max 8)').setMinValue(1).setMaxValue(8).setRequired(false)
                    )
                    .addIntegerOption((n) =>
                        n.setName('packs').setDescription('Packs per player (default 3)').setMinValue(1).setMaxValue(6).setRequired(false)
                    )
            ) as GargoyleSlashCommandBuilder
    ];

    public override async init(client: GargoyleClient): Promise<void> {
        const raw = await this.getRawBulkData(client);
        if (!raw) return;

        const setRaw = new Map<string, {
            commons: SlimCard[];
            uncommons: SlimCard[];
            rares: SlimCard[];
            mythics: SlimCard[];
            lands: SlimCard[];
        }>();

        for (const card of raw) {
            const slim: SlimCard = {
                id: card.id,
                name: card.name,
                set: card.set,
                set_name: card.set_name,
                rarity: card.rarity,
                type_line: card.type_line,
                booster: card.booster,
                digital: card.digital,
                image_uris: card.image_uris ? { normal: card.image_uris.normal } : undefined,
                card_faces: card.card_faces?.map(f => ({
                    name: f.name,
                    image_uris: f.image_uris ? { normal: f.image_uris.normal } : undefined,
                })),
            };

            const normalized = slim.name.toLowerCase();
            if (!this.cardMap.has(normalized)) {
                this.cardNames.push(normalized);
                this.cardMap.set(normalized, slim);
            }

            this.allCards.push(slim);

            if (!slim.booster || slim.digital) continue;

            if (!setRaw.has(slim.set)) {
                setRaw.set(slim.set, { commons: [], uncommons: [], rares: [], mythics: [], lands: [] });
            }
            const bucket = setRaw.get(slim.set)!;

            // Guard against cards missing type_line (tokens, art cards, etc.)
            if (slim.type_line?.includes('Basic Land')) {
                bucket.lands.push(slim);
            } else {
                switch (slim.rarity) {
                    case 'common':   bucket.commons.push(slim);   break;
                    case 'uncommon': bucket.uncommons.push(slim); break;
                    case 'rare':     bucket.rares.push(slim);     break;
                    case 'mythic':   bucket.mythics.push(slim);   break;
                }
            }
        }

        for (const [set, pool] of setRaw) {
            if (pool.commons.length > 0 && pool.rares.length > 0) {
                this.setIndex.set(set, pool);
                this.boosterSets.push(set);
            }
        }

        client.logger.trace(
            `Indexed ${this.cardNames.length} unique cards, ${this.setIndex.size} draftable sets`
        );
    }

    public override async executeSlashCommand(_client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();

        if (this.cardMap.size === 0) {
            await interaction.editReply({ content: 'Card data is not yet loaded. Please try again in a moment.' });
            return;
        }

        const sub = interaction.options.getSubcommand(true);

        if (sub === 'random') {
            const card = random(this.allCards);
            await interaction.editReply({ files: getCardImages(card) });

        } else if (sub === 'card') {
            const query = interaction.options.getString('name', true).toLowerCase();
            const matches = this.findCards(query);

            if (matches.length === 1) {
                await interaction.editReply({
                    content: `**${matches[0].name}**`,
                    files: getCardImages(matches[0])
                });
            } else {
                const files = matches.flatMap(getCardImages).slice(0, 10);
                await interaction.editReply({
                    content: matches.map((c) => `**${c.name}**`).join('\n'),
                    files
                });
            }

        } else if (sub === 'booster') {
            const setInput = interaction.options.getString('set', false)?.toLowerCase();
            const set = setInput ?? random(this.boosterSets);
            const pool = this.setIndex.get(set);

            if (!pool) {
                await interaction.editReply({ content: `Unknown or non-draftable set: \`${set}\`` });
                return;
            }

            const booster = openBooster(pool);
            const files = booster.flatMap(getCardImages).slice(0, 10);
            const setName = booster[0]?.set_name ?? set.toUpperCase();

            await interaction.editReply({
                content: `**Booster pack — ${setName}**\n${booster.map(a=>a.name).join('\n')}`,
                files
            });

        } else if (sub === 'chaosdraft') {
            const players = interaction.options.getInteger('players', false) ?? 8;
            const packsPerPlayer = interaction.options.getInteger('packs', false) ?? 3;

            const lines: string[] = [
                `# Chaos Draft — ${players} players, ${packsPerPlayer} packs each`,
                `# Generated ${new Date().toUTCString()}`,
                '',
            ];

            for (let p = 1; p <= players; p++) {
                lines.push(`## Player ${p}`);
                lines.push('');

                for (let pk = 1; pk <= packsPerPlayer; pk++) {
                    const set = random(this.boosterSets);
                    const pool = this.setIndex.get(set)!;
                    const booster = openBooster(pool);
                    const setName = booster[0]?.set_name ?? set.toUpperCase();

                    lines.push(`### Pack ${pk} — ${setName} (${set.toUpperCase()})`);
                    for (const card of booster) {
                        lines.push(`1 ${card.name} (${card.set.toUpperCase()})`);
                    }
                    lines.push('');
                }
            }

            const txt = lines.join('\n');
            const attachment = new AttachmentBuilder(Buffer.from(txt, 'utf-8'), {
                name: `chaos-draft-${players}p-${packsPerPlayer}pk.txt`,
                description: `Chaos draft pool for ${players} players`
            });

            await interaction.editReply({
                content: `**Chaos Draft** — ${players} players × ${packsPerPlayer} packs (${players * packsPerPlayer} total boosters from random sets)`,
                files: [attachment]
            });
        }
    }

    private findCards(query: string): SlimCard[] {
        const exact = this.cardMap.get(query);
        if (exact) return [exact];

        const substringMatches = this.cardNames
            .filter((name) => name.includes(query))
            .slice(0, 5)
            .map((name) => this.cardMap.get(name)!);

        if (substringMatches.length > 0) return substringMatches;

        const closestName = closest(query, this.cardNames);
        const closestDist = distance(query, closestName);

        return this.cardNames
            .filter((name) => distance(query, name) === closestDist)
            .slice(0, 5)
            .map((name) => this.cardMap.get(name)!);
    }

    private async getRawBulkData(client: GargoyleClient): Promise<RawCard[] | null> {
        client.logger.trace('Getting Scryfall bulk data');

        const dataUrl = (
            (await (await fetch('https://api.scryfall.com/bulk-data')).json()) as {
                data: { type: string; download_uri: string }[];
            }
        ).data.find((o) => o.type === 'default_cards')?.download_uri;

        if (!dataUrl) {
            client.logger.error('No download_uri in Scryfall bulk-data response');
            return null;
        }

        const fileName = dataUrl.split('/').at(-1)!;
        const filePath = path.join(tmpdir(), fileName);

        if (fileExistsSync(filePath)) {
            client.logger.trace('Bulk data already cached');
        } else {
            client.logger.trace('Downloading bulk data');
            await $`rm -rf /tmp/default-cards-* 2>&1`.catch((e) => e);
            await Bun.write(filePath, await (await fetch(dataUrl)).text());
        }

        // Parse then immediately discard the reference — GC can collect after init()
        return (await Bun.file(filePath).json()) as RawCard[];
    }

    public override events: GargoyleEvent[] = [new CardMessage(this)];
}

function openBooster(pool: BoosterPool): SlimCard[] {
    const chosen = new Set<string>();
    const booster: SlimCard[] = [];

    booster.push(...takeRandomUnique(pool.commons, 6, chosen));

    booster.push(...takeRandomUnique(pool.uncommons, 3, chosen));

    const rareSlot = Math.random() < 0.125 && pool.mythics.length > 0
        ? random(pool.mythics)
        : random(pool.rares);
    booster.push(rareSlot);
    chosen.add(rareSlot.id);

    const wildcard = weightedRandom([
        { weight: 71, cards: pool.commons.filter((c) => !chosen.has(c.id)) },
        { weight: 18, cards: pool.uncommons.filter((c) => !chosen.has(c.id)) },
        { weight: 10, cards: pool.rares.filter((c) => !chosen.has(c.id)) },
        { weight:  1, cards: pool.mythics.filter((c) => !chosen.has(c.id)) },
    ]);
    booster.push(wildcard);
    chosen.add(wildcard.id);

    if (pool.lands.length > 0) {
        const land = random(pool.lands.filter((c) => !chosen.has(c.id)));
        if (land) {
            booster.push(land);
            chosen.add(land.id);
        }
    }

    const foil = weightedRandom([
        { weight: 70, cards: pool.commons.filter((c) => !chosen.has(c.id)) },
        { weight: 20, cards: pool.uncommons.filter((c) => !chosen.has(c.id)) },
        { weight:  9, cards: pool.rares.filter((c) => !chosen.has(c.id)) },
        { weight:  1, cards: pool.mythics.filter((c) => !chosen.has(c.id)) },
    ]);
    booster.push(foil);

    return booster;
}

function random<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

function takeRandomUnique<T extends { id: string }>(
    source: T[],
    count: number,
    alreadyChosen: Set<string>
): T[] {
    const pool = source.filter((c) => !alreadyChosen.has(c.id));
    const chosen: T[] = [];

    while (chosen.length < count && pool.length > 0) {
        const index = Math.floor(Math.random() * pool.length);
        const card = pool.splice(index, 1)[0];
        alreadyChosen.add(card.id);
        chosen.push(card);
    }

    return chosen;
}

function weightedRandom<T>(entries: { weight: number; cards: T[] }[]): T {
    const viable = entries.filter((e) => e.cards.length > 0);
    const total = viable.reduce((a, b) => a + b.weight, 0);
    let r = Math.random() * total;

    for (const entry of viable) {
        if (r < entry.weight) return random(entry.cards);
        r -= entry.weight;
    }

    return random(viable[viable.length - 1].cards);
}

function getCardImages(card: SlimCard): string[] {
    if (card.image_uris?.normal) return [card.image_uris.normal];
    if (card.card_faces) {
        return card.card_faces.flatMap((f) => f.image_uris?.normal ? [f.image_uris.normal] : []);
    }
    return [];
}

class CardMessage extends GargoyleEvent {
    constructor(private module: Magic) {
        super();
    }

    public override event: keyof ClientEvents = Events.MessageCreate;

    public override execute(_client: GargoyleClient, message: Message, ..._args: any[]): void {
        if (message.author.bot || message.content === '') return;

        const files: string[] = [];
        for (const match of message.content.matchAll(/\[\[(.*?)\]\]/g)) {
            const card = this.module.cardMap.get(match[1].toLowerCase());
            if (card) files.push(...getCardImages(card));
        }

        if (files.length > 0) message.reply({ files });
    }
}

type RawCard = {
    id: string;
    name: string;
    set: string;
    set_name: string;
    set_id: UUID;
    rarity: SlimCard['rarity'];
    type_line: string | undefined; // Some cards (tokens, art cards, etc.) may omit this
    booster: boolean;
    digital: boolean;
    released_at: string;
    uri: string;
    scryfall_uri: string;
    layout: string;
    mana_cost: string;
    oracle_text: string;
    colors: string[];
    color_identity: string[];
    keywords: string[];
    produced_mana: string[];
    collector_number: number;
    image_uris?: {
        small: string; normal: string; large: string;
        png: string; art_crop: string; border_crop: string;
    };
    card_faces?: {
        name: string;
        image_uris?: {
            small: string; normal: string; large: string;
            png: string; art_crop: string; border_crop: string;
        };
    }[];
    prices: { usd: string | null; usd_foil: number | null; usd_etched: string | null };
};