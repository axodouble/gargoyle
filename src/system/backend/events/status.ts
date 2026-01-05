import { getBirthdayUsers } from '@src/modules/fun/birthday.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent.js';
import { ActivityType, Events, User } from 'discord.js';

export default class Ready extends GargoyleEvent {
    public event = Events.ClientReady as const;
    override once = true;
    private birthdayUsers: User[] = [];
    private hasShownBirthdayMessage = false;

    public execute(client: GargoyleClient): void {
        setInterval(
            async () => {
                const birthdayUserIds = (await getBirthdayUsers(client)).map((user) => user.userId);

                let birthdayUsers: User[] = [];

                birthdayUserIds.forEach(async (userId) => {
                    const user = await client.users.fetch(userId);
                    if (user) {
                        birthdayUsers.push(user);
                    }
                });

                this.birthdayUsers = birthdayUsers;
            },
            2 * 60 * 60 * 1000
        );

        setInterval(async () => {
            let state = getStatusMessage();

            if (!this.hasShownBirthdayMessage && this.birthdayUsers.length > 0) {
                const birthdayName = this.birthdayUsers
                    .map((user) => user.username)
                    .sort(() => Math.random() - 0.5)
                    .pop();
                state = `🎉 Happy birthday ${birthdayName}!`;
            }

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

            this.hasShownBirthdayMessage = !this.hasShownBirthdayMessage;

            client.user?.setActivity({
                name: 'custom',
                type: ActivityType.Custom,
                state: state
            });
        }, 30000);
    }
}

let bodiesFound = 0;
function getStatusMessage(): string {
    const msPerDay = 24 * 60 * 60 * 1000;
    const now = new Date();

    const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const isPastOct5Utc = now.getUTCMonth() > 9 || (now.getUTCMonth() === 9 && now.getUTCDate() > 5);
    const targetYearUtc = isPastOct5Utc ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    const oct5Utc = Date.UTC(targetYearUtc, 9, 5);

    const daysUntilOct5 = Math.max(0, Math.floor((oct5Utc - startOfTodayUtc) / msPerDay));

    const messages = [
        `{bodies} bodies, 0 found`,
        `just ${daysUntilOct5} more days...`,
        '🍺 God gives his tastiest beers to his drunkest drivers.',
        'The voices are getting louder',
        'Nevermind change of plans, tomorrow.',
        'I see dead pixels.'
    ];

    const status = messages[Math.floor(Math.random() * messages.length)];

    if (status.includes('{bodies}')) {
        bodiesFound += 1;
        return status.replace('{bodies}', bodiesFound.toString()) + (process.env.ENVIRONMENT === 'prod' ? '' : ' (dev)');
    } else {
        return status + (process.env.ENVIRONMENT === 'prod' ? '' : ' (dev)');
    }
}
