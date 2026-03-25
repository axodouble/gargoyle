import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import { ClientEvents, Events, Message, PartialGroupDMChannel } from 'discord.js';
import { Ollama, Tool } from 'ollama';

const ollama = new Ollama({ host: process.env.OLLAMA_HOST ?? 'http://localhost:11434' });
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'granite4:tiny-h';
const CONTEXT_FETCH_LIMIT = Number(process.env.GARGLE_CONTEXT_FETCH_LIMIT ?? 30);
const CONTEXT_RECENT_MESSAGES = Number(process.env.GARGLE_CONTEXT_RECENT_MESSAGES ?? 12);
const CONTEXT_USER_MESSAGES = Number(process.env.GARGLE_CONTEXT_USER_MESSAGES ?? 5);
const CONTEXT_MAX_CHARS = Number(process.env.GARGLE_CONTEXT_MAX_CHARS ?? 1800);

const tools: Tool[] = [
    {
        type: 'function',
        function: {
            name: 'get_face',
            description:
                'Express an emotion using a text face. Always call this before giving your response to show how you feel. Valid categories: happy, sad, angry, acting_cute, confused, surprised.',
            parameters: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        description: 'The emotion category: happy, sad, angry, acting_cute, confused, or surprised.'
                    }
                },
                required: ['category']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'ignore_message',
            description:
                'Use this when a message mentions Gargle but is not asking Gargle anything (for example announcements, status broadcasts, or messages aimed at everyone). Calling this means Gargle should not send any reply.',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: 'Short reason for ignoring the message.'
                    }
                },
                required: []
            }
        }
    }
];

enum Faces {
    Happy1 = '(\\*^_^\\*)',
    Happy2 = '(＾▽＾)',
    Happy3 = '(☆▽☆)',
    Happy4 = '(/≧▽≦)/',
    Sad1 = '＞﹏＜',
    Sad2 = '(T_T)',
    Sad3 = '(；一_一)',
    Sad4 = '(╥_╥)',
    Sad5 = '<( _ _ )>',
    Angry1 = '(╬ಠ益ಠ)',
    Angry2 = '(ノಠ益ಠ)ノ彡┻━┻',
    Angry3 = '(╬ﾟдﾟ)',
    Angry4 = '(╯▔皿▔)╯',
    Angry5 = 'ᕦ(ò_óˇ)ᕤ',
    ActingCute1 = '(≧◡≦)',
    ActingCute2 = '( ͡° ͜ʖ ͡°)',
    ActingCute3 = '(。・ω・。)',
    ActingCute4 = '(^///^)',
    ActingCute5 = 'ᓚᘏᗢ',
    Confused1 = '(・_・?)',
    Confused2 = '(°ロ°) !?',
    Confused3 = '(・_・;)',
    Confused4 = '(°ー°〃)',
    Confused5 = '(・・? )',
    Surprised1 = '(ﾟДﾟ)',
    Surprised2 = 'Σ(°ロ°)',
    Surprised3 = '(⊙_⊙)？',
    Surprised4 = 'o_o',
    Surprised5 = '(°ロ°) !?'
}

function getRandomFace(category: string): string {
    const matches = Object.entries(Faces).filter(([key]) => key.toLowerCase().startsWith(category.toLowerCase()));
    if (!matches.length) return '';
    return matches[Math.floor(Math.random() * matches.length)][1];
}

function resolveFace(category?: string): string {
    if (!category) return getRandomFace('happy');

    const normalized = category.toLowerCase().replace(/[^a-z]/g, '');
    const aliasMap: Record<string, string> = {
        happy: 'happy',
        sad: 'sad',
        angry: 'angry',
        actingcute: 'actingcute',
        cute: 'actingcute',
        confused: 'confused',
        surprise: 'surprised',
        surprised: 'surprised'
    };

    const mappedCategory = aliasMap[normalized] ?? 'happy';
    return getRandomFace(mappedCategory);
}

const SYSTEM_PROMPT = `You are Gargle, a borderline stupid, but friendly bot in Discord.

Guidelines:
- If a message mentions Gargle but is not a direct inquiry to Gargle (for example announcements or messages aimed at everyone), call ignore_message and do not reply.
- When you are going to reply, always call get_face first to express how you feel about the current message before writing your reply.
- Treat user and bot messages as transcript lines in the format speaker: message (example: user_bob: hello, gargle: hi).
- Be conversational, natural, and concise — this is a chat environment, not an essay.
- Match your tone and energy to the conversation.
- Do not use emoji's like 😊, 🌟, use emoticons like the following: ${Object.values(Faces).join(', ')}.`;

function normalizeMessageText(content: string): string {
    return content.replace(/\s+/g, ' ').trim();
}

function normalizeParticipantLabel(name: string, isBot: boolean): string {
    if (isBot) return 'gargle';
    const normalized = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `user_${normalized || 'unknown'}`;
}

function replaceBotMentions(content: string, botId: string): string {
    return content.replace(new RegExp(`<@!?${botId}>`, 'g'), '@Gargle');
}

function trimContextLines(lines: string[], maxChars: number): string[] {
    const trimmed: string[] = [];
    let total = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const nextTotal = total + line.length + 1;
        if (nextTotal > maxChars) break;
        trimmed.unshift(line);
        total = nextTotal;
    }

    return trimmed;
}

async function buildPromptContext(message: Message, botId: string): Promise<string | null> {
    const fetched = await message.channel.messages.fetch({ limit: CONTEXT_FETCH_LIMIT });
    const history = [...fetched.values()]
        .filter((entry) => entry.id !== message.id)
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((entry) => {
            const text = normalizeMessageText(replaceBotMentions(entry.content ?? '', botId));
            if (!text) return null;
            const author = normalizeParticipantLabel(entry.author.username, entry.author.id === botId);
            return { author, text, authorId: entry.author.id };
        })
        .filter((entry): entry is { author: string; text: string; authorId: string } => Boolean(entry));

    if (!history.length) return null;

    const recentConversation = history.slice(-CONTEXT_RECENT_MESSAGES).map((entry) => `${entry.author}: ${entry.text}`);

    const userHistory = history
        .filter((entry) => entry.authorId === message.author.id)
        .slice(-CONTEXT_USER_MESSAGES)
        .map((entry) => `${entry.author}: ${entry.text}`);

    const sections: string[] = [];

    if (recentConversation.length) {
        const lines = trimContextLines(recentConversation, CONTEXT_MAX_CHARS);
        if (lines.length) {
            sections.push(`Recent conversation transcript (oldest to newest):\n${lines.join('\n')}`);
        }
    }

    if (userHistory.length) {
        const lines = trimContextLines(userHistory, Math.floor(CONTEXT_MAX_CHARS / 2));
        if (lines.length) {
            sections.push(`Recent messages from ${normalizeParticipantLabel(message.author.username, false)}:\n${lines.join('\n')}`);
        }
    }

    return sections.length ? sections.join('\n\n') : null;
}

export default class Gargle extends GargoyleModule {
    public override category: string = 'cc';
    public override name: string = 'gargle';
    public guilds = ['750209335841390642', '1009048008857493624', '800358349543178251', '1475065895742214267'];
    public override events: GargoyleEvent[] = [new GargleMessageEvent(this)];
}

class GargleMessageEvent extends GargoyleEvent {
    public override event: keyof ClientEvents = Events.MessageCreate as const;
    private module: Gargle;
    constructor(module: Gargle) {
        super();
        this.module = module;
    }

    public override async execute(client: GargoyleClient, message: Message): Promise<void> {
        if (message.author.bot) return;
        if (!client.user || !message.mentions.has(client.user)) return;

        const normalizedContent = normalizeMessageText(replaceBotMentions(message.content, client.user.id));
        const userLabel = normalizeParticipantLabel(message.author.username, false);
        const withoutExplicitMention = normalizeMessageText(normalizedContent.replace('@Gargle', '').trim());
        const contentForPrompt = withoutExplicitMention || normalizedContent;
        if (!contentForPrompt) return;
        const userMessage = `${userLabel}: ${contentForPrompt}`;

        if (!message.mentions.has(client.user.id)) return;
        if (!message.guildId || !this.module.guilds.includes(message.guildId)) return;

        const channel = message.channel;
        if (channel instanceof PartialGroupDMChannel) return;

        // Keep typing indicator alive for the duration of the AI call (expires after ~10s)
        const typingInterval = setInterval(() => channel.sendTyping(), 8000);
        await channel.sendTyping();

        try {
            const promptContext = await buildPromptContext(message, client.user.id);

            const messages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }[] = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...(promptContext ? [{ role: 'system' as const, content: promptContext }] : []),
                { role: 'user', content: userMessage }
            ];

            let emotionFace: string | null = null;
            let shouldIgnoreMessage = false;
            const MAX_TOOL_ITERATIONS = 10;

            for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
                const response = await ollama.chat({ model: OLLAMA_MODEL, messages, tools });
                messages.push({ role: 'assistant', content: response.message.content ?? '' });

                if (response.message.tool_calls?.length) {
                    for (const toolCall of response.message.tool_calls) {
                        let result: string;
                        try {
                            const args = toolCall.function.arguments as Record<string, string>;
                            switch (toolCall.function.name) {
                                case 'get_face':
                                    result = resolveFace(args.category);
                                    emotionFace = result;
                                    break;
                                case 'ignore_message':
                                    shouldIgnoreMessage = true;
                                    result = args.reason ? `Ignoring message: ${args.reason}` : 'Ignoring message';
                                    break;
                                default:
                                    result = `Unknown tool: ${toolCall.function.name}`;
                            }
                        } catch (err) {
                            result = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
                        }
                        messages.push({ role: 'tool', content: result });
                    }

                    if (shouldIgnoreMessage) break;
                } else {
                    const content = response.message.content?.trim();
                    if (content && !shouldIgnoreMessage) {
                        const face = emotionFace || resolveFace();
                        const reply = `${face} ${replaceEmojisWithEmoticons(content)}`;
                        await message.reply(reply.slice(0, 2000));
                    }
                    break;
                }
            }
        } catch (err) {
            client.logger.error('Gargle error', err instanceof Error ? (err.stack ?? err.message) : String(err));
        } finally {
            clearInterval(typingInterval);
        }
    }
}

function replaceEmojisWithEmoticons(text: string): string {
    return text
        .replaceAll('😊', '(\\*^_^\\*)')
        .replaceAll('🌟', '(☆▽☆)')
        .replaceAll('😢', '(T_T)')
        .replaceAll('😂', '(≧▽≦)')
        .replaceAll('🎉', '(\\^o^\\)')
        .replaceAll('😄', '(≧▽≦)');
}
