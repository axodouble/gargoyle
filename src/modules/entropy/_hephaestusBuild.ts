import {
    compatibleAttachments,
    HEPHAESTUS_LAUNCHER_CATEGORIES,
    HephaestusAttachment,
    HephaestusAttachmentType,
    HephaestusGun,
    HephaestusStore
} from './_hephaestusData';

export const HORIZONTAL_RECOIL_WEIGHT = 2;
export const PLAYER_HEALTH = 100;

export type HephaestusObjective = 'dps' | 'recoil' | 'ttk' | 'magazine' | 'speed' | 'magdamage';

export interface HephaestusBuildSlot {
    slot: HephaestusAttachmentType;
    item: HephaestusAttachment | null;
}

export interface HephaestusBuild {
    gun: HephaestusGun;
    slots: HephaestusBuildSlot[];
    dps: number;
    ttk: number;
    recoil: number;
    magazineCapacity: number;
    speed: number;
    magDamage: number;
}

export interface HephaestusReferences {
    maxDps: number;
    maxMagazineCapacity: number;
    maxSpeed: number;
    minRecoil: number;
    maxRecoil: number;
    maxMagDamage: number;
}

interface Accumulators {
    recoilX: number;
    recoilY: number;
}

function recoilScore(gun: HephaestusGun, accumulators: Accumulators, candidate: HephaestusAttachment | null): number {
    const horizontal = gun.recoilMaxX * HORIZONTAL_RECOIL_WEIGHT * accumulators.recoilX * (candidate?.multipliers.recoilX ?? 1);
    const vertical = gun.recoilMaxY * accumulators.recoilY * (candidate?.multipliers.recoilY ?? 1);
    return Math.sqrt(horizontal * horizontal + vertical * vertical);
}

function slotValue(candidate: HephaestusAttachment | null, slot: HephaestusAttachmentType, objective: HephaestusObjective): number {
    const multipliers = candidate?.multipliers;
    if (objective === 'dps' || objective === 'ttk') return multipliers?.ballisticDamage ?? 1;
    if (objective === 'speed') return multipliers?.moveSpeed ?? 1;
    if (objective === 'magazine') return slot === 'Magazine' ? (candidate?.capacity ?? 0) : 1;
    return (slot === 'Magazine' ? (candidate?.capacity ?? 1) : 1) * (multipliers?.ballisticDamage ?? 1);
}

function slotCandidates(store: HephaestusStore, gun: HephaestusGun, slot: HephaestusAttachmentType): HephaestusAttachment[] {
    if (slot === 'Magazine') {
        const candidates: HephaestusAttachment[] = [];
        const seen = new Set<number>();
        if (gun.defaultMagazine !== null) {
            const magazine = store.attachments.get(gun.defaultMagazine);
            if (magazine !== undefined) {
                candidates.push(magazine);
                seen.add(magazine.id);
            }
        }
        for (const candidate of compatibleAttachments(store, gun.magazineCalibers, 'Magazine')) {
            if (!seen.has(candidate.id)) {
                seen.add(candidate.id);
                candidates.push(candidate);
            }
        }
        return candidates;
    }

    if (!gun.hooks[slot.toLowerCase() as keyof HephaestusGun['hooks']]) return [];
    return compatibleAttachments(store, gun.attachmentCalibers, slot);
}

function pickSlot(
    store: HephaestusStore,
    gun: HephaestusGun,
    slot: HephaestusAttachmentType,
    objective: HephaestusObjective,
    accumulators: Accumulators
): HephaestusAttachment | null {
    const candidates = slotCandidates(store, gun, slot);
    if (candidates.length === 0) return null;

    const allowNone = slot !== 'Magazine';
    let best: HephaestusAttachment | null = allowNone ? null : candidates[0];
    let bestValue = slotValue(best, slot, objective);
    let bestRecoil = recoilScore(gun, accumulators, best);

    for (let i = allowNone ? 0 : 1; i < candidates.length; i++) {
        const candidate = candidates[i];
        const value = slotValue(candidate, slot, objective);
        const recoil = recoilScore(gun, accumulators, candidate);
        const better = objective === 'recoil' ? recoil < bestRecoil : value > bestValue || (value === bestValue && recoil < bestRecoil);
        if (better) {
            best = candidate;
            bestValue = value;
            bestRecoil = recoil;
        }
    }

    return best;
}

export function buildForGun(store: HephaestusStore, gun: HephaestusGun, objective: HephaestusObjective): HephaestusBuild {
    const accumulators: Accumulators = { recoilX: 1, recoilY: 1 };
    let damageMultiplier = 1;
    let speedMultiplier = 1;
    let magazineCapacity = 0;
    const slots: HephaestusBuildSlot[] = [];

    for (const slot of ['Magazine', 'Barrel', 'Grip', 'Sight', 'Tactical'] as HephaestusAttachmentType[]) {
        const chosen = pickSlot(store, gun, slot, objective, accumulators);
        slots.push({ slot, item: chosen });
        if (chosen !== null) {
            accumulators.recoilX *= chosen.multipliers.recoilX;
            accumulators.recoilY *= chosen.multipliers.recoilY;
            damageMultiplier *= chosen.multipliers.ballisticDamage;
            speedMultiplier *= chosen.multipliers.moveSpeed;
            if (slot === 'Magazine') magazineCapacity = chosen.capacity ?? 0;
        }
    }

    const dps = gun.damage * gun.firerate * damageMultiplier;
    return {
        gun,
        slots,
        dps,
        ttk: dps > 0 ? PLAYER_HEALTH / dps : Infinity,
        recoil: recoilScore(gun, accumulators, null),
        magazineCapacity,
        speed: gun.moveSpeed * speedMultiplier,
        magDamage: magazineCapacity * gun.damage * damageMultiplier
    };
}

function objectiveValue(build: HephaestusBuild, objective: HephaestusObjective): number {
    switch (objective) {
        case 'recoil':
            return -build.recoil;
        case 'ttk':
            return -build.ttk;
        case 'magazine':
            return build.magazineCapacity;
        case 'speed':
            return build.speed;
        case 'magdamage':
            return build.magDamage;
        default:
            return build.dps;
    }
}

export function bestBuild(
    store: HephaestusStore,
    objective: HephaestusObjective,
    gun?: HephaestusGun,
    pool?: Iterable<HephaestusGun>
): HephaestusBuild | null {
    let best: HephaestusBuild | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    const guns = gun !== undefined ? [gun] : (pool ?? store.guns.values());
    for (const candidate of guns) {
        if (candidate.firerate <= 0 || candidate.damage <= 0) continue;
        const build = buildForGun(store, candidate, objective);
        const value = objectiveValue(build, objective);
        if (value > bestValue) {
            bestValue = value;
            best = build;
        }
    }
    return best;
}

export function computeReferences(store: HephaestusStore, pool: Iterable<HephaestusGun>): HephaestusReferences {
    let maxDps = 0;
    let maxMagazineCapacity = 0;
    let maxSpeed = 0;
    let minRecoil = Number.POSITIVE_INFINITY;
    let maxRecoil = 0;
    let maxMagDamage = 0;

    for (const gun of pool) {
        if (gun.firerate <= 0 || gun.damage <= 0) continue;
        const dps = buildForGun(store, gun, 'dps');
        maxDps = Math.max(maxDps, dps.dps);
        maxMagDamage = Math.max(maxMagDamage, dps.magDamage);
        maxMagazineCapacity = Math.max(maxMagazineCapacity, buildForGun(store, gun, 'magazine').magazineCapacity);
        maxSpeed = Math.max(maxSpeed, buildForGun(store, gun, 'speed').speed);
        const recoil = buildForGun(store, gun, 'recoil').recoil;
        minRecoil = Math.min(minRecoil, recoil);
        maxRecoil = Math.max(maxRecoil, recoil);
    }

    return { maxDps, maxMagazineCapacity, maxSpeed, minRecoil, maxRecoil, maxMagDamage };
}

export function isLauncherLike(store: HephaestusStore, gun: HephaestusGun): boolean {
    if (gun.categories.some((category) => HEPHAESTUS_LAUNCHER_CATEGORIES.has(category))) return true;
    const magazines = compatibleAttachments(store, gun.magazineCalibers, 'Magazine');
    if (gun.defaultMagazine !== null) {
        const defaultMagazine = store.attachments.get(gun.defaultMagazine);
        if (defaultMagazine !== undefined && !magazines.some((magazine) => magazine.id === defaultMagazine.id)) {
            magazines.push(defaultMagazine);
        }
    }
    return magazines.some((magazine) => (magazine.capacity ?? 0) === 1);
}
