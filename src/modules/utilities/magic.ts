import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { $, fetch } from 'bun';
import { UUID } from 'crypto';
import { ApplicationIntegrationType, ChatInputCommandInteraction, ClientEvents, Events, InteractionContextType, Message } from 'discord.js';
import { closest, distance } from 'fastest-levenshtein';
import { tmpdir } from 'os';
import path from 'path';
import { fileExistsSync } from 'tsconfig-paths/lib/filesystem';

export default class Magic extends GargoyleModule {
    public override name: string = 'magic';
    public override category: string = 'utilities';
    private bulkData: BulkData | null = null;
    private cardNames: string[] = [];
    public cardMap: Map<string, Card> = new Map();

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
                    .addStringOption((n) => n.setName('set').setDescription('The set code to open a booster from (random if omitted)').setRequired(false))
            ) as GargoyleSlashCommandBuilder
    ];

    public override async init(client: GargoyleClient): Promise<void> {
        this.bulkData = await this.getBulkData(client);
        if (this.bulkData) {
            for (const card of this.bulkData) {
                const normalized = card.name.toLowerCase();
                if (!this.cardMap.has(normalized)) {
                    this.cardNames.push(normalized);
                    this.cardMap.set(normalized, card);
                }
            }
            client.logger.trace(`Indexed ${this.cardNames.length} unique cards`);
        }
    }

    public override async executeSlashCommand(_client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();
        if (!this.bulkData) {
            await interaction.editReply({ content: 'Sorry about this, I have not yet pulled up-to-date data. Please try again later.' });
            return;
        }

        if (interaction.options.getSubcommand(true) === 'random') {
            const card = this.bulkData[Math.floor(Math.random() * this.bulkData.length)];
            const images = getCardImages(card);
            await interaction.editReply({
                content: null,
                files: images
            });
        } else if (interaction.options.getSubcommand(true) === 'card') {
            const query = interaction.options.getString('name', true).toLowerCase();
            const matches = this.findCards(query);

            if (matches.length === 1) {
                await interaction.editReply({
                    content: `**${matches[0].name}**`,
                    files: getCardImages(matches[0])
                });
            } else {
                // Flatten all images from all matched cards, staying within Discord's 10 attachment limit
                const files = matches.flatMap((c) => getCardImages(c)).slice(0, 10);
                await interaction.editReply({
                    content: matches.map((c) => `**${c.name}**`).join('\n'),
                    files
                });
            }
        } else if (interaction.options.getSubcommand(true) === 'booster') {
            const setInput = interaction.options.getString('set', false)?.toLowerCase();

            // If no set was provided, pick one at random from all booster-eligible sets
            const set = setInput ?? (() => {
                const availableSets = [...new Set(
                    [...this.cardMap.values()]
                        .filter(c => c.booster && !c.digital)
                        .map(c => c.set)
                )];
                return random(availableSets);
            })();

            const cards = [...this.cardMap.values()].filter(
                c => c.set === set &&
                    c.booster &&
                    !c.digital
            );

            if (!cards.length) {
                await interaction.editReply({
                    content: 'Unknown set.',
                });
                return;
            }

            const commons = cards.filter(c => c.rarity === "common");
            const uncommons = cards.filter(c => c.rarity === "uncommon");
            const rares = cards.filter(c => c.rarity === "rare");
            const mythics = cards.filter(c => c.rarity === "mythic");

            const lands = cards.filter(c =>
                c.type_line.includes("Basic Land")
            );

            const chosen = new Set<string>();

            const booster: Card[] = [];

            /* Commons */
            booster.push(...takeRandomUnique(
                commons,
                6,
                chosen
            ));

            /* Uncommons */
            booster.push(...takeRandomUnique(
                uncommons,
                3,
                chosen
            ));

            /* Rare/Mythic */
            {
                const card =
                    Math.random() < 0.125
                        ? random(mythics)
                        : random(rares);

                booster.push(card);
                chosen.add(card.id);
            }

            /* Wildcard slot */
            {
                const wildcard = weightedRandom([
                    {
                        weight: 71,
                        cards: commons.filter(c => !chosen.has(c.id))
                    },
                    {
                        weight: 18,
                        cards: uncommons.filter(c => !chosen.has(c.id))
                    },
                    {
                        weight: 10,
                        cards: rares.filter(c => !chosen.has(c.id))
                    },
                    {
                        weight: 1,
                        cards: mythics.filter(c => !chosen.has(c.id))
                    }
                ]);

                booster.push(wildcard);
                chosen.add(wildcard.id);
            }

            /* Land slot */
            if (lands.length) {
                const land = random(
                    lands.filter(c => !chosen.has(c.id))
                );

                booster.push(land);
                chosen.add(land.id);
            }

            /* Foil slot */
            {
                const foil = weightedRandom([
                    {
                        weight: 70,
                        cards: commons.filter(c => !chosen.has(c.id))
                    },
                    {
                        weight: 20,
                        cards: uncommons.filter(c => !chosen.has(c.id))
                    },
                    {
                        weight: 9,
                        cards: rares.filter(c => !chosen.has(c.id))
                    },
                    {
                        weight: 1,
                        cards: mythics.filter(c => !chosen.has(c.id))
                    }
                ]);

                booster.push({
                    ...foil,
                });
            }
        }
    }

    private findCards(query: string): Card[] {
        // 1. Exact match — return immediately, no need to search further
        const exact = this.cardMap.get(query);
        if (exact) return [exact];

        // 2. Substring match — find all cards whose name contains the query
        const substringMatches = this.cardNames
            .filter((name) => name.includes(query))
            .slice(0, 5)
            .map((name) => this.cardMap.get(name)!);

        if (substringMatches.length > 0) return substringMatches;

        // 3. Fuzzy fallback — find the closest card by Levenshtein distance,
        //    then return all cards within the same distance of that closest match
        const closestName = closest(query, this.cardNames);
        const closestDist = distance(query, closestName);

        return this.cardNames
            .filter((name) => distance(query, name) === closestDist)
            .slice(0, 5)
            .map((name) => this.cardMap.get(name)!);
    }

    private async getBulkData(client: GargoyleClient): Promise<BulkData | null> {
        client.logger.trace('Getting Scryfall data');

        const dataUrl = (
            (await (await fetch('https://api.scryfall.com/bulk-data')).json()) as {
                data: [{ type: 'default_cards'; download_uri: string }];
            }
        ).data.find((o) => o.type === 'default_cards')?.download_uri;

        if (!dataUrl) {
            client.logger.error('No data url in bulk data?');
            return null;
        }

        const fileName = dataUrl.split('/').at(-1)!;
        const filePath = path.join(tmpdir(), fileName);

        if (fileExistsSync(filePath)) {
            client.logger.trace('Data already downloaded');
        } else {
            client.logger.trace('Data not yet downloaded');
            await $`rm -rf /tmp/default-cards-* 2&>1`.catch(e => e)
            await Bun.write(filePath, await (await fetch(dataUrl)).text());
        }

        return (await Bun.file(filePath).json()) as BulkData;
    }

    public override events: GargoyleEvent[] = [
        new CardMessage(this)
    ]
}

function random<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

function takeRandomUnique<T>(
    source: T[],
    count: number,
    alreadyChosen: Set<string>
): T[] {
    const pool = source.filter(c => !alreadyChosen.has((c as any).id));

    const chosen: T[] = [];

    while (chosen.length < count && pool.length) {
        const index = Math.floor(Math.random() * pool.length);
        const card = pool.splice(index, 1)[0];

        alreadyChosen.add((card as any).id);
        chosen.push(card);
    }

    return chosen;
}

function weightedRandom<T>(entries: { weight: number; cards: T[] }[]): T {
    const total = entries.reduce((a, b) => a + b.weight, 0);

    let r = Math.random() * total;

    for (const entry of entries) {
        if (r < entry.weight) {
            return random(entry.cards);
        }

        r -= entry.weight;
    }

    return random(entries[entries.length - 1].cards);
}

class CardMessage extends GargoyleEvent {
    constructor(module: Magic) {
        super()
        this.module = module;
    }
    private module: Magic;
    public override event: keyof ClientEvents = Events.MessageCreate;

    public override execute(_client: GargoyleClient, message: Message, ..._args: any[]): void {
        if (message.author.bot || message.content === '') return;

        const matches = []
        for (const match of message.content.matchAll(/\[\[(.*?)\]\]/g)) {
            const card = this.module.cardMap.get(match[1].toLowerCase())
            if ((card)) matches.push(...getCardImages(card))
        }

        if (matches.length > 0) {
            message.reply({
                files: matches
            })
        }
    }
}

function getCardImages(card: Card): string[] {
    if (card.image_uris?.normal) {
        return [card.image_uris.normal];
    }
    if (card.card_faces) {
        return card.card_faces.flatMap((face) => face.image_uris?.normal ? [face.image_uris.normal] : []);
    }
    return [];
}

type BulkData = Card[];
type Card = {
    id: string;
    name: string;
    released_at: string;
    uri: string;
    scryfall_uri: string;
    layout: string;
    image_uris?: Image_URIs;
    card_faces?: CardFace[];
    mana_cost: string;
    type_line: string;
    oracle_text: string;
    colors: string[];
    color_identity: string[];
    keywords: string[];
    produced_mana: string[];
    rarity: "common" | "uncommon" | "rare" | "special" | "mythic" | "bonus";

    set: string;
    set_name: string;
    set_id: UUID;
    digital: boolean;
    collector_number: number;
    booster: boolean;
    prices: { usd: string | null; usd_foil: number | null; usd_etched: string | null };
};
type CardFace = {
    name: string;
    image_uris?: Image_URIs;
};
type Image_URIs = {
    small: string;
    normal: string;
    large: string;
    png: string;
    art_crop: string;
    border_crop: string;
};