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
            let state = `🌺 Ceraia ${process.env.ENVIRONMENT === 'prod' ? '' : '(dev)'}`;

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
