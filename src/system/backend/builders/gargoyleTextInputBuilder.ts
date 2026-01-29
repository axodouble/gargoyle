import { TextInputBuilder } from 'discord.js';
import GargoyleModule from '../classes/gargoyleModule.js';

export default class GargoyleTextInputBuilder extends TextInputBuilder {
    constructor(module: GargoyleModule, ...argument: string[]) {
        super();
        if (argument.join('').includes(':')) {
            throw new Error(`Arguments cannot contain colons (:): ${argument.join(', ')}`);
        }
        const customId = `gm1:${module.name.toLowerCase()}:${argument.join(':').toLowerCase()}`;
        if (customId.length > 100) {
            throw new Error(`Custom ID exceeds 100 characters: ${customId}`);
        }
        this.setCustomId(customId);
    }
}
