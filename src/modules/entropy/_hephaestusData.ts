import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const HEPHAESTUS_WORKSHOP_ROOT = '/tmp/steam/steamapps/workshop/content/304930/1959614756';

export const HEPHAESTUS_ATTACHMENT_TYPES = ['Barrel', 'Grip', 'Sight', 'Tactical', 'Magazine'] as const;
export type HephaestusAttachmentType = (typeof HEPHAESTUS_ATTACHMENT_TYPES)[number];

export const HEPHAESTUS_CATEGORIES = ['AR', 'BR', 'AT', 'DMR', 'SR', 'AMR', 'GL', 'MG', 'Pistol', 'Revolver', 'SMG', 'Shotgun'] as const;
export const HEPHAESTUS_LAUNCHER_CATEGORIES: ReadonlySet<string> = new Set(['AT', 'GL']);

/**
 * Server blacklist: item IDs that /hephaestus build ignores by default.
 * Blacklisted guns are excluded from default and category searches, and from the
 * radar percentile pool, but are still buildable when named explicitly (gun=...).
 * Add an item's numeric ID below to blacklist it.
 */
export const HEPHAESTUS_BLACKLIST: ReadonlySet<number> = new Set<number>([
    59521, // Lahti L-39
    59526, // DIY Lahti L-39 Anti-Tryhard
    59582, // Anzio 20mm
    58900, // M93 Black Arrow
    59075, // QBU-10 AMR
    58323, // PinkVAL
    58240, // OSV-96
    59478, // Hecate II
    58892, // TAC-50 A1-R2
    58222, // M107
    58231, // GM6 Lynx
    58645, // SenVU Virtuoso
    58954 // AA-12
]);

export interface HephaestusMultipliers {
    recoilX: number;
    recoilY: number;
    spread: number;
    sway: number;
    shake: number;
    speed: number;
    aimDuration: number;
    moveSpeed: number;
    ballisticDamage: number;
}

export interface HephaestusAttachment {
    id: number;
    type: HephaestusAttachmentType;
    name: string;
    rarity: string;
    calibers: number[];
    multipliers: HephaestusMultipliers;
    capacity: number | null;
    isBipod: boolean;
}

export interface HephaestusGun {
    id: number;
    name: string;
    rarity: string;
    cartridge: string | null;
    categories: string[];
    magazineCalibers: number[];
    attachmentCalibers: number[];
    damage: number;
    firerate: number;
    range: number;
    moveSpeed: number;
    recoilMinX: number;
    recoilMinY: number;
    recoilMaxX: number;
    recoilMaxY: number;
    defaultSight: number | null;
    defaultMagazine: number | null;
    defaultBarrel: number | null;
    hooks: { sight: boolean; grip: boolean; tactical: boolean; barrel: boolean };
}

export interface HephaestusStore {
    guns: Map<number, HephaestusGun>;
    attachments: Map<number, HephaestusAttachment>;
    attachmentsByCaliber: Map<number, HephaestusAttachment[]>;
    caliberNames: Map<number, string>;
}

export function parseDatFile(text: string): Map<string, string> {
    const properties = new Map<string, string>();
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line === '' || line.startsWith('//')) continue;
        const separator = line.indexOf(' ');
        if (separator === -1) {
            properties.set(line, '');
        } else {
            properties.set(line.slice(0, separator), line.slice(separator + 1).trim());
        }
    }
    return properties;
}

function readIndexedCalibers(properties: Map<string, string>, base: string): number[] {
    const count = Number(properties.get(`${base}s`) ?? 0) || 0;
    const calibers: number[] = [];
    for (let i = 0; i < count; i++) {
        const value = Number(properties.get(`${base}_${i}`) ?? 0);
        if (value > 0) calibers.push(value);
    }
    return calibers;
}

function num(properties: Map<string, string>, key: string, fallback: number): number {
    const value = properties.get(key);
    if (value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function isHexGuid(value: string | undefined): boolean {
    return value !== undefined && /^[0-9a-f]{32}$/i.test(value);
}

function extractCartridge(description: string): string | null {
    const match = description.match(/Cartridge:\s*(?:<color=[^>]*>)?([^<\n]+)/i);
    if (!match) return null;
    const cartridge = match[1].trim();
    return cartridge === '' ? null : cartridge;
}

function neutralMultipliers(properties: Map<string, string>): HephaestusMultipliers {
    return {
        recoilX: num(properties, 'Recoil_X', 1),
        recoilY: num(properties, 'Recoil_Y', 1),
        spread: num(properties, 'Spread', 1),
        sway: num(properties, 'Sway', 1),
        shake: num(properties, 'Shake', 1),
        speed: num(properties, 'Speed', 1),
        aimDuration: num(properties, 'Aim_Duration_Multiplier', 1),
        moveSpeed: num(properties, 'Equipable_Movement_Speed_Multiplier', 1),
        ballisticDamage: num(properties, 'Ballistic_Damage_Multiplier', 1)
    };
}

async function readLocalization(file: string): Promise<{ name: string | null; description: string }> {
    try {
        const properties = parseDatFile(await readFile(join(dirname(file), 'English.dat'), 'utf8'));
        return { name: properties.get('Name') ?? null, description: properties.get('Description') ?? '' };
    } catch {
        return { name: null, description: '' };
    }
}

async function ingestItemFile(file: string, store: HephaestusStore, relativeDir: string): Promise<void> {
    const properties = parseDatFile(await readFile(file, 'utf8'));
    const type = properties.get('Type');
    const id = Number(properties.get('ID') ?? 0);
    if (!isHexGuid(properties.get('GUID')) || !Number.isInteger(id) || id === 0) return;
    if (type !== 'Gun' && !HEPHAESTUS_ATTACHMENT_TYPES.includes(type as HephaestusAttachmentType)) return;

    const localization = await readLocalization(file);
    const name = localization.name ?? basename(file, '.dat');

    if (type === 'Gun') {
        const magazineCalibers = readIndexedCalibers(properties, 'Magazine_Caliber');
        const attachmentCalibers = readIndexedCalibers(properties, 'Attachment_Caliber');
        const cartridge = extractCartridge(localization.description);
        const segments = relativeDir.split('/');
        const categories =
            segments[0] === 'Guns' && segments[1] !== undefined
                ? segments[1]
                      .split(',')
                      .map((category) => category.trim())
                      .filter((category) => category !== '')
                : [];
        store.guns.set(id, {
            id,
            name,
            rarity: properties.get('Rarity') ?? 'Common',
            cartridge,
            categories,
            magazineCalibers,
            attachmentCalibers: attachmentCalibers.length > 0 ? attachmentCalibers : magazineCalibers,
            damage: num(properties, 'Player_Damage', 0),
            firerate: num(properties, 'Firerate', 0),
            range: num(properties, 'Range', 0),
            moveSpeed: num(properties, 'Equipable_Movement_Speed_Multiplier', 1),
            recoilMinX: num(properties, 'Recoil_Min_X', 0),
            recoilMinY: num(properties, 'Recoil_Min_Y', 0),
            recoilMaxX: num(properties, 'Recoil_Max_X', 0),
            recoilMaxY: num(properties, 'Recoil_Max_Y', 0),
            defaultSight: num(properties, 'Sight', 0) || null,
            defaultMagazine: num(properties, 'Magazine', 0) || null,
            defaultBarrel: num(properties, 'Barrel', 0) || null,
            hooks: {
                sight: properties.has('Hook_Sight'),
                grip: properties.has('Hook_Grip'),
                tactical: properties.has('Hook_Tactical'),
                barrel: properties.has('Hook_Barrel')
            }
        });
        if (cartridge !== null) {
            for (const caliber of magazineCalibers) {
                if (!store.caliberNames.has(caliber)) store.caliberNames.set(caliber, cartridge);
            }
        }
        return;
    }

    const attachmentType = type as HephaestusAttachmentType;
    const calibers = readIndexedCalibers(properties, 'Caliber');
    store.attachments.set(id, {
        id,
        type: attachmentType,
        name,
        rarity: properties.get('Rarity') ?? 'Common',
        calibers,
        multipliers: neutralMultipliers(properties),
        capacity: attachmentType === 'Magazine' ? num(properties, 'Amount', 0) || null : null,
        isBipod: properties.has('Bipod')
    });

    const segments = relativeDir.split('/');
    if (segments[0] === 'Barrels' && segments[1] !== undefined) {
        for (const caliber of calibers) {
            if (!store.caliberNames.has(caliber)) store.caliberNames.set(caliber, segments[1]);
        }
    }
}

async function ingestDirectory(directory: string, store: HephaestusStore, relativeDir: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
            await ingestDirectory(full, store, relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`);
        } else if (entry.name.endsWith('.dat') && entry.name !== 'English.dat') {
            await ingestItemFile(full, store, relativeDir);
        }
    }
}

export async function loadHephaestusStore(root: string = HEPHAESTUS_WORKSHOP_ROOT): Promise<HephaestusStore> {
    const store: HephaestusStore = {
        guns: new Map(),
        attachments: new Map(),
        attachmentsByCaliber: new Map(),
        caliberNames: new Map()
    };
    await ingestDirectory(join(root, 'Bundles', 'Items'), store, '');
    for (const attachment of store.attachments.values()) {
        for (const caliber of attachment.calibers) {
            let list = store.attachmentsByCaliber.get(caliber);
            if (list === undefined) {
                list = [];
                store.attachmentsByCaliber.set(caliber, list);
            }
            list.push(attachment);
        }
    }
    return store;
}

export function compatibleAttachments(store: HephaestusStore, calibers: number[], type: HephaestusAttachmentType): HephaestusAttachment[] {
    const seen = new Set<number>();
    const compatible: HephaestusAttachment[] = [];
    for (const caliber of calibers) {
        for (const attachment of store.attachmentsByCaliber.get(caliber) ?? []) {
            if (attachment.type === type && !seen.has(attachment.id)) {
                seen.add(attachment.id);
                compatible.push(attachment);
            }
        }
    }
    return compatible;
}

export enum HephaestusEmoji {
    t="<:hephaestus1:1544189939653148805><:hephaestus2:1544189933860823140>",
    m="<:hephaestus3:1544189929129771018><:hephaestus4:1544189924192952370>",
    b="<:hephaestus5:1544189951871029318><:hephaestus6:1544189945290293439>",
    self="<:hephaestus:1544191228797521940>"
}