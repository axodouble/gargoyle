class ChattoCommandBuilder {
    private _name: string | undefined;
    private _description: string | undefined;
    private _aliases: string[] = [];
    private _guilds: string[] = [];
    private _usage: string | undefined;
    private _private: boolean = false;

    setName(name: string): this {
        if (!name || typeof name !== 'string') {
            throw new Error('Name must be a non-empty string.');
        }
        this._name = name;
        return this;
    }

    setUsage(usage: string): this {
        if (!usage || typeof usage !== 'string') {
            throw new Error('Usage must be a non-empty string.');
        }
        this._usage = usage;
        return this;
    }

    setDescription(description: string): this {
        if (!description || typeof description !== 'string') {
            throw new Error('Description must be a non-empty string.');
        }
        this._description = description;
        return this;
    }

    addAlias(alias: string): this {
        if (!alias || typeof alias !== 'string') {
            throw new Error('Alias must be a non-empty string.');
        }
        this._aliases.push(alias);
        return this;
    }

    addGuild(guild: string): this {
        if (!guild || typeof guild !== 'string') {
            throw new Error('Guild must be a non-empty string.');
        }
        this._guilds.push(guild);
        return this;
    }

    addGuilds(...guilds: string[]): this {
        if (!guilds) {
            throw new Error('Guilds must be a non-empty string list.');
        }
        guilds.forEach((guild) => this._guilds.push(guild));
        return this;
    }

    /**
     * Sets whether the command is private or not.
     * @param priv Whether the command is private or not, hides it from help messages.
     * @returns The instance of the builder for chaining.
     */
    setPrivate(priv: boolean = true): this {
        this._private = priv;
        return this;
    }

    get usage(): string {
        if (!this._usage) return this.name;
        return this._usage;
    }

    get private(): boolean {
        return this._private;
    }

    get name(): string {
        if (!this._name) {
            throw new Error('Command name has not been set.');
        }
        return this._name;
    }

    get description(): string {
        if (!this._description) {
            throw new Error('Command description has not been set.');
        }
        return this._description;
    }

    get aliases(): string[] {
        return this._aliases;
    }

    get guilds(): string[] {
        return this._guilds;
    }
}

export default ChattoCommandBuilder;
