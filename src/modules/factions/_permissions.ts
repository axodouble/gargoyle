import { Guild, GuildMember, PermissionFlagsBits } from 'discord.js';
import GargoyleClient from '@classes/gargoyleClient.js';
import { listFactions } from './_db.js';

export async function isFactionLeaderOrAdmin(client: GargoyleClient, guild: Guild, member: GuildMember): Promise<boolean> {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    const factions = await listFactions(client, guild.id);
    return factions.some((faction) => member.roles.cache.has(faction.leader_role_id));
}

export async function isLeaderOfFactionOrAdmin(client: GargoyleClient, guild: Guild, member: GuildMember, factionId: number): Promise<boolean> {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    const factions = await listFactions(client, guild.id);
    const faction = factions.find((entry) => entry.id === factionId);
    return faction ? member.roles.cache.has(faction.leader_role_id) : false;
}
