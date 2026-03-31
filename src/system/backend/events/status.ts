import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent.js';
import { ActivityType, Events } from 'discord.js';

export default class Ready extends GargoyleEvent {
    public event = Events.ClientReady as const;
    override once = true;

    public execute(client: GargoyleClient): void {
        setInterval(async () => {
            let state = getStatusMessage(client);

            const today = new Date();
            if (today.getMonth() === 9 && today.getDate() === 5) {
                state = '🎉 Happy birthday Axodouble!';
            }
            if (today.getMonth() === 11 && today.getDate() === 25) {
                state = '🎄 Merry Christmas!';
            }
            if (today.getMonth() === 0 && today.getDate() === 1) {
                state = '🎉 Happy New Year!';
            }

            client.user?.setActivity({
                name: 'custom',
                type: ActivityType.Custom,
                state: state
            });
        }, 30000);
    }
}

let bodiesFound = 0;
function getStatusMessage(client: GargoyleClient): string {
    const msPerDay = 24 * 60 * 60 * 1000;
    const now = new Date();

    const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const isPastOct5Utc = now.getUTCMonth() > 9 || (now.getUTCMonth() === 9 && now.getUTCDate() > 5);
    const targetYearUtc = isPastOct5Utc ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    const oct5Utc = Date.UTC(targetYearUtc, 9, 5);

    const daysUntilOct5 = Math.max(0, Math.floor((oct5Utc - startOfTodayUtc) / msPerDay));

    const messages = [
        `${client.guilds.cache.size} servers strong!`,
        `All hail now the panopticon`,
        'Developed with duct tape and dreams.',
        'Running....',
        `${Math.round(process.uptime())} seconds of uptime.`,
        `Watching ${client.users.cache.random()?.username}...`,
        `{bodies} bodies, 0 found`,
        `just ${daysUntilOct5} more days...`,
        '🍺 God gives his tastiest beers to his drunkest drivers.',
        'The voices are getting louder',
        'Nevermind change of plans, tomorrow.',
        'Use /daily!',
        'Use /disguise to disguise the bot as something else!',
        'I cried against an ocean of light'
    ];

    let status = messages[Math.floor(Math.random() * messages.length)];

    if (process.env.ENVIRONMENT !== 'prod') {
        status += ` (dev)`;
    }

    if (status.includes('{bodies}')) {
        bodiesFound += 1;
        status = status.replace('{bodies}', bodiesFound.toString());
    }

    return status;
}
