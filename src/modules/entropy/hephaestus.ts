import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { ChatInputCommandInteraction } from 'discord.js';
import GargoyleEmbedBuilder from '@src/system/backend/builders/gargoyleEmbedBuilder';
import { access } from 'node:fs/promises';
import { distance } from 'fastest-levenshtein';
import {
    HEPHAESTUS_BLACKLIST,
    HEPHAESTUS_CATEGORIES,
    HEPHAESTUS_LAUNCHER_CATEGORIES,
    HEPHAESTUS_WORKSHOP_ROOT,
    HephaestusAttachmentType,
    HephaestusGun,
    HephaestusStore,
    loadHephaestusStore
} from './_hephaestusData';
import {
    HephaestusAxisScores,
    HephaestusAxisStats,
    HephaestusBuild,
    HephaestusLeaderboardEntry,
    HephaestusObjective,
    axisScores,
    bestBuild,
    computeAxisStats,
    isLauncherLike,
    leaderboard
} from './_hephaestusBuild';
import { renderRadarChart } from './_hephaestusRadar';

// Main goal is to store all guns, all attachments, all ammo in memory
// Automatically map all items downloaded over steamcmd
// And produce the mathematically best builds
// Reference can be found here: https://docs.smartlydressedgames.com/en/stable/items/introduction.html
//
// Gun Assets: https://docs.smartlydressedgames.com/en/stable/items/gun-asset.html
// Grip Assets: https://docs.smartlydressedgames.com/en/stable/items/grip-asset.html
// Magazine Assets: https://docs.smartlydressedgames.com/en/stable/items/magazine-asset.html
// Sight Assets: https://docs.smartlydressedgames.com/en/stable/items/sight-asset.html
// Tactical Assets: https://docs.smartlydressedgames.com/en/stable/items/tactical-asset.html
// Barrel Assets: https://docs.smartlydressedgames.com/en/stable/items/barrel-asset.html

export default class Hephaestus extends GargoyleModule {
    public override name: string = 'hephaestus';
    public override category: string = 'entropy';
    private store: HephaestusStore | null = null;
    private statsCache: HephaestusAxisStats | null = null;

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('hephaestus')
            .setDescription('Hephaestus Manager')
            .addGuild('1009048008857493624')
            .addSubcommand((s) => s.setName('actualize').setDescription('Actualize Inventory'))
            .addSubcommand((s) =>
                s
                    .setName('build')
                    .setDescription('Forge the mathematically best gun build')
                    .addStringOption((o) =>
                        o
                            .setName('objective')
                            .setDescription('What the build should be optimized for')
                            .setRequired(true)
                            .addChoices(
                                { name: 'dps', value: 'dps' },
                                { name: 'ttk', value: 'ttk' },
                                { name: 'recoil', value: 'recoil' },
                                { name: 'magazine', value: 'magazine' },
                                { name: 'speed', value: 'speed' },
                                { name: 'magdamage', value: 'magdamage' },
                                { name: 'overall', value: 'overall' }
                            )
                    )
                    .addStringOption((o) =>
                        o
                            .setName('category')
                            .setDescription('Restrict to a weapon class (default: all non-launcher guns)')
                            .addChoices(...HEPHAESTUS_CATEGORIES.map((category) => ({ name: category, value: category })))
                    )
                    .addStringOption((o) => o.setName('gun').setDescription('A specific gun to optimize for (overrides category)'))
            )
            .addSubcommand((s) =>
                s
                    .setName('leaderboard')
                    .setDescription('Show the top guns for a value')
                    .addStringOption((o) =>
                        o
                            .setName('value')
                            .setDescription('Which value to rank by')
                            .setRequired(true)
                            .addChoices(
                                { name: 'dps', value: 'dps' },
                                { name: 'ttk', value: 'ttk' },
                                { name: 'recoil', value: 'recoil' },
                                { name: 'magazine', value: 'magazine' },
                                { name: 'speed', value: 'speed' },
                                { name: 'magdamage', value: 'magdamage' },
                                { name: 'overall', value: 'overall' }
                            )
                    )
                    .addStringOption((o) =>
                        o
                            .setName('category')
                            .setDescription('Restrict to a weapon class (default: all non-launcher guns)')
                            .addChoices(...HEPHAESTUS_CATEGORIES.map((category) => ({ name: category, value: category })))
                    )
                    .addIntegerOption((o) => o.setName('limit').setDescription('How many to show (default 10)').setMinValue(1).setMaxValue(25))
            ) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(_client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();
        if (interaction.options.getSubcommand() === 'actualize') {
            await interaction.editReply(await this.actualizeNordic());
            return;
        }

        const store = await this.ensureStore();
        if (store === null) {
            await interaction.editReply('Failed to load item data. Run `/hephaestus actualize` first.');
            return;
        }

        if (interaction.options.getSubcommand() === 'leaderboard') {
            await this.runLeaderboard(interaction, store);
            return;
        }

        const objective = interaction.options.getString('objective', true) as HephaestusObjective;
        const gunQuery = interaction.options.getString('gun');
        const category = interaction.options.getString('category');

        let gun: HephaestusGun | undefined;
        if (gunQuery !== null) {
            const match = this.findGun(store, gunQuery);
            if (match === null) {
                await interaction.editReply(`No gun found matching \`${gunQuery}\`.`);
                return;
            }
            gun = match;
        }

        const pool = gun === undefined ? this.searchPool(store, category) : undefined;

        const stats = await this.axisStats(store);
        const build = bestBuild(store, objective, gun, pool, objective === 'overall' ? stats : undefined);
        if (build === null) {
            await interaction.editReply('No buildable gun found.');
            return;
        }

        const scores = axisScores(build, stats);
        const embed = this.formatBuild(store, build, objective, category, scores);
        embed.setThumbnail('attachment://hephaestus-radar.png');
        await interaction.editReply({
            embeds: [embed],
            files: [{ attachment: this.buildRadar(scores), name: 'hephaestus-radar.png' }]
        });
    }

    private async runLeaderboard(interaction: ChatInputCommandInteraction, store: HephaestusStore): Promise<void> {
        const objective = interaction.options.getString('value', true) as HephaestusObjective;
        const category = interaction.options.getString('category');
        const limit = interaction.options.getInteger('limit') ?? 10;

        const pool = this.searchPool(store, category);
        if (pool.length === 0) {
            await interaction.editReply('No guns found in that category.');
            return;
        }

        const stats = await this.axisStats(store);
        const entries = leaderboard(store, objective, pool, stats, limit);
        const embed = this.formatLeaderboard(objective, category, entries);
        await interaction.editReply({ embeds: [embed] });
    }

    private searchPool(store: HephaestusStore, category: string | null): HephaestusGun[] {
        let pool = [...store.guns.values()];
        if (category !== null) {
            pool = pool.filter((candidate) => candidate.categories.includes(category));
        }
        const explicitLauncher = category !== null && [...HEPHAESTUS_LAUNCHER_CATEGORIES].includes(category);
        if (!explicitLauncher) {
            pool = pool.filter((candidate) => !isLauncherLike(store, candidate));
        }
        return pool.filter((candidate) => !HEPHAESTUS_BLACKLIST.has(candidate.id));
    }

    private async ensureStore(): Promise<HephaestusStore | null> {
        if (this.store !== null) return this.store;
        try {
            await access(HEPHAESTUS_WORKSHOP_ROOT);
        } catch {
            const result = await this.actualizeNordic();
            if (result !== 'actualized') return null;
        }
        try {
            this.store = await loadHephaestusStore();
        } catch {
            return null;
        }
        return this.store;
    }

    private async axisStats(store: HephaestusStore): Promise<HephaestusAxisStats> {
        if (this.statsCache === null) {
            const pool = [...store.guns.values()].filter((gun) => !isLauncherLike(store, gun) && !HEPHAESTUS_BLACKLIST.has(gun.id));
            this.statsCache = computeAxisStats(store, pool);
        }
        return this.statsCache;
    }

    private buildRadar(scores: HephaestusAxisScores): Buffer {
        return renderRadarChart([
            { label: 'DPS', value: scores.dps },
            { label: 'Cap', value: scores.magazineCapacity },
            { label: 'Speed', value: scores.speed },
            { label: 'Recoil', value: scores.recoil },
            { label: ' DMG', value: scores.magDamage }
        ]);
    }

    private findGun(store: HephaestusStore, query: string): HephaestusGun | null {
        const needle = query.trim().toLowerCase();
        for (const gun of store.guns.values()) {
            if (gun.name.toLowerCase() === needle) return gun;
        }
        let best: HephaestusGun | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const gun of store.guns.values()) {
            const candidate = gun.name.toLowerCase();
            if (!candidate.includes(needle)) continue;
            const distanceToQuery = distance(candidate, needle);
            if (distanceToQuery < bestDistance) {
                bestDistance = distanceToQuery;
                best = gun;
            }
        }
        if (best !== null) return best;
        for (const gun of store.guns.values()) {
            const distanceToQuery = distance(gun.name.toLowerCase(), needle);
            if (distanceToQuery < bestDistance) {
                bestDistance = distanceToQuery;
                best = gun;
            }
        }
        return bestDistance <= 3 ? best : null;
    }

    private formatBuild(
        store: HephaestusStore,
        build: HephaestusBuild,
        objective: HephaestusObjective,
        category: string | null,
        scores: HephaestusAxisScores
    ): GargoyleEmbedBuilder {
        const caliber = build.gun.cartridge ?? this.formatCalibers(store, build.gun.magazineCalibers);
        const description = `**${build.gun.name}** — \`${build.gun.id}\`${caliber !== '' ? ` — ${caliber}` : ''}${category !== null ? `\nCategory: ${category}` : ''}`;
        const embed = new GargoyleEmbedBuilder().setTitle(`Hephaestus — ${objective.toUpperCase()} Build`).setDescription(description);

        for (const slot of ['Magazine', 'Barrel', 'Grip', 'Sight', 'Tactical'] as HephaestusAttachmentType[]) {
            const entry = build.slots.find((s) => s.slot === slot);
            if (!entry) continue;
            if (entry.item === null) {
                embed.addFields({ name: slot, value: '*None*', inline: false });
                continue;
            }
            const calibers = this.formatCalibers(store, entry.item.calibers);
            embed.addFields({
                name: slot,
                value: `**${entry.item.name}** — \`${entry.item.id}\`${calibers !== '' ? ` — ${calibers}` : ''}`,
                inline: false
            });
        }

        embed.addFields({
            name: 'Stats',
            value:
                `**DPS** ${build.dps.toFixed(1)} — **TTK** ${Number.isFinite(build.ttk) ? `${build.ttk.toFixed(2)}s` : '∞'}\n` +
                `**Magazine** ${build.magazineCapacity} rounds — **Mag Damage** ${build.magDamage.toFixed(0)}\n` +
                `**Speed** ${build.speed.toFixed(3)} — **Recoil** ${build.recoil.toFixed(3)}\n` +
                `**Balance** DPS ${scores.dps.toFixed(0)} — Cap ${scores.magazineCapacity.toFixed(0)} — Spd ${scores.speed.toFixed(0)} — Rec ${scores.recoil.toFixed(0)} — Mag ${scores.magDamage.toFixed(0)}`
        });

        const notes = ['Recoil score weights horizontal recoil ×2.'];
        if (category === null) notes.push('Launcher-type weapons are excluded by default.');
        embed.setFooter({ text: notes.join(' ') });
        return embed;
    }

    private formatLeaderboard(objective: HephaestusObjective, category: string | null, entries: HephaestusLeaderboardEntry[]): GargoyleEmbedBuilder {
        const lines = entries.map((entry, index) => {
            const gun = entry.build.gun;
            return `${index + 1}. **${gun.name}** \`${gun.id}\` — ${this.formatLeaderboardValue(objective, entry)}`;
        });
        const description = `${category !== null ? `Category: ${category}\n\n` : ''}${lines.join('\n')}`;
        const embed = new GargoyleEmbedBuilder().setTitle(`Hephaestus — ${objective.toUpperCase()} Leaderboard`).setDescription(description);
        const notes = ['Recoil score weights horizontal recoil ×2.'];
        if (category === null) notes.push('Launcher-type weapons are excluded by default.');
        embed.setFooter({ text: notes.join(' ') });
        return embed;
    }

    private formatLeaderboardValue(objective: HephaestusObjective, entry: HephaestusLeaderboardEntry): string {
        const build = entry.build;
        switch (objective) {
            case 'ttk':
                return `${build.ttk.toFixed(2)}s`;
            case 'recoil':
                return build.recoil.toFixed(3);
            case 'magazine':
                return `${build.magazineCapacity} rounds`;
            case 'speed':
                return build.speed.toFixed(3);
            case 'magdamage':
                return build.magDamage.toFixed(0);
            case 'overall':
                return `min ${entry.value.toFixed(1)} · avg ${entry.average.toFixed(1)}`;
            default:
                return build.dps.toFixed(1);
        }
    }

    private formatCalibers(store: HephaestusStore, calibers: number[]): string {
        return [...new Set(calibers.map((caliber) => store.caliberNames.get(caliber) ?? `#${caliber}`))].join(', ');
    }

    private async actualizeNordic() {
        const process = Bun.spawnSync({
            cmd: [
                '/opt/steamcmd/steamcmd.sh',
                '+force_install_dir "/tmp/steam"',
                '+login anonymous',
                '+workshop_download_item 304930 1959614756',
                '+quit'
            ],
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const exitCode = await process.exitCode;
        if (exitCode === 0) {
            this.store = null;
            this.statsCache = null;
            return 'actualized';
            // The files will now be located at:
            // /tmp/steam/steamapps/workshop/content/304930/1959614756/
        } else {
            return `SteamCMD failed with exit code: ${exitCode}`;
        }
    }
}
