import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { $, fetch } from 'bun';
import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType } from 'discord.js';
import { closest, distance } from 'fastest-levenshtein';
import { tmpdir } from 'os';
import path from 'path';
import { fileExistsSync } from 'tsconfig-paths/lib/filesystem';

export default class Magic extends GargoyleModule {
    public override name: string = 'magic';
    public override category: string = 'fun';
    private bulkData: BulkData | null = null;
    private cardNames: string[] = [];
    private cardMap: Map<string, Card> = new Map();

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
            .addSubcommand((s) => s.setName('random').setDescription('Get a random card')) as GargoyleSlashCommandBuilder
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
            const images = this.getCardImages(card);
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
                    files: this.getCardImages(matches[0])
                });
            } else {
                // Flatten all images from all matched cards, staying within Discord's 10 attachment limit
                const files = matches.flatMap((c) => this.getCardImages(c)).slice(0, 10);
                await interaction.editReply({
                    content: matches.map((c) => `**${c.name}**`).join('\n'),
                    files
                });
            }
        }
    }

    private getCardImages(card: Card): string[] {
        if (card.image_uris?.normal) {
            return [card.image_uris.normal];
        }
        if (card.card_faces) {
            return card.card_faces.flatMap((face) => face.image_uris?.normal ? [face.image_uris.normal] : []);
        }
        return [];
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
            await $`rm -rf /tmp/default-cards-*`
            await Bun.write(filePath, await (await fetch(dataUrl)).text());
        }

        return (await Bun.file(filePath).json()) as BulkData;
    }
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
    rarity: string;
    collector_number: number;
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