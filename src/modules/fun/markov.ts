import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import { ChatInputCommandInteraction, ClientEvents, Message } from 'discord.js';
import { model, Schema } from 'mongoose';

export default class Markov extends GargoyleModule {
    public override name: string = 'markov';
    public override category: string = 'fun';

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('markov')
            .setDescription('Generate a Markov chain message based on previous messages in this server.')
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.commandName === 'markov') {
            if (!client.db) {
                interaction.reply('Database not connected. Markov chains are unavailable.');
                return;
            }

            const guildId = interaction.guild?.id;
            if (!guildId) {
                interaction.reply('This command can only be used in a server.');
                return;
            }

            const doc = await databaseMarkovChains.findOne({ guildId }).catch((err) => {
                client.logger.error(err);
                return null;
            });

            if (!doc || doc.markovChain.size === 0) {
                interaction.reply('No Markov chain data available for this server.');
                return;
            }

            const markovChain = doc.markovChain;
            const keys = Array.from(markovChain.keys());
            let currentKey = keys[Math.floor(Math.random() * keys.length)];
            let result = currentKey;

            for (let i = 0; i < 50; i++) {
                const nextWords = markovChain.get(currentKey);
                if (!nextWords || nextWords.length === 0) break;

                const nextWord = nextWords[Math.floor(Math.random() * nextWords.length)];
                result += ' ' + nextWord;

                const keyParts = currentKey.split(' ');
                currentKey = `${keyParts[1]} ${nextWord}`;
            }

            interaction.reply({ content: result, allowedMentions: { parse: [] } });
        }
    }

    public override events: GargoyleEvent[] = [new MarkovMessageEvent()];
}

/**
 * Split the content into message chunks of 2 words, and store it as an array
 * So this sentence would be
 * ["So this", "sentence would", "be"]
 * And processed as:
 * {
 *  "So this": ["sentence would"],
 *  "sentence would": ["be"],
 *  "be": []
 * }
 *
 * And if the keys already exist it appends to the array.
 */
class MarkovMessageEvent extends GargoyleEvent {
    public override event: keyof ClientEvents = 'messageCreate';

    public override async execute(client: GargoyleClient, message: Message): Promise<void> {
        if (message.author.bot) return;
        if (message.content.length === 0) return;
        if (!client.db) return;

        const guildId = message.guild?.id;
        if (!guildId) return;

        const doc = await getMarkovDoc(guildId);
        const markovChain = doc.markovChain;

        const words = message.content.split(/\s+/);
        for (let i = 0; i < words.length - 2; i++) {
            const key = `${words[i]} ${words[i + 1]}`;
            const nextWord = words[i + 2];

            const nextWords = markovChain.get(key) ?? [];
            nextWords.push(nextWord);
            markovChain.set(key, nextWords);
        }

        await doc.save();
    }
}

const markovSchema = new Schema({
    guildId: { type: String, required: true },
    markovChain: { type: Map, of: [String], required: true }
});

const databaseMarkovChains = model('MarkovChain', markovSchema);

async function getMarkovDoc(guildId: string) {
    let doc = await databaseMarkovChains.findOne({ guildId });
    if (!doc) {
        doc = new databaseMarkovChains({
            guildId,
            markovChain: new Map()
        });
        await doc.save();
    }
    return doc;
}
