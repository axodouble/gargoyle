import { TextInputBuilder } from 'discord.js';
import GargoyleModule from '../classes/gargoyleModule.js';

export default class GargoyleTextInputBuilder extends TextInputBuilder {
    constructor(module: GargoyleModule, ...argument: string[]) {
        super();

        const customId = `cmd-${module.name.toLowerCase()}-${argument.join('-').toLowerCase()}`;
        if (customId.length > 100) {
            throw new Error(`Custom ID exceeds 100 characters: ${customId}`);
        }
        this.setCustomId(customId);
    }
}
