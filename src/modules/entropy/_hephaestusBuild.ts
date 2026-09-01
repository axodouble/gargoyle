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

export type HephaestusObjective = 'dps' | 'recoil' | 'ttk' | 'magazine' | 'speed' | 'magdamage' | 'overall';

export const HEPHAESTUS_AXES = ['dps', 'magazineCapacity', 'speed', 'recoil', 'magDamage'] as const;
export type HephaestusAxis = (typeof HEPHAESTUS_AXES)[number];

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

export interface HephaestusAxisStats {
    dps: number[];
    magazineCapacity: number[];
    speed: number[];
    recoil: number[];
    magDamage: number[];
}

export interface HephaestusAxisScores {
    dps: number;
    magazineCapacity: number;
    speed: number;
    recoil: number;
    magDamage: number;
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
    const candidates = compatibleAttachments(store, gun.attachmentCalibers, slot);
    return slot === 'Grip' ? candidates.filter((candidate) => !candidate.isBipod) : candidates;
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

export interface HephaestusLeaderboardEntry {
    build: HephaestusBuild;
    value: number;
    average: number;
}

export function leaderboard(
    store: HephaestusStore,
    objective: HephaestusObjective,
    pool: Iterable<HephaestusGun>,
    stats: HephaestusAxisStats,
    limit: number
): HephaestusLeaderboardEntry[] {
    const entries: HephaestusLeaderboardEntry[] = [];
    for (const gun of pool) {
        if (gun.firerate <= 0 || gun.damage <= 0) continue;
        if (objective === 'overall') {
            let best: HephaestusBuild | null = null;
            let bestMin = Number.NEGATIVE_INFINITY;
            let bestAverage = Number.NEGATIVE_INFINITY;
            for (const buildObjective of ['dps', 'magazine', 'speed', 'recoil', 'magdamage'] as HephaestusObjective[]) {
                const build = buildForGun(store, gun, buildObjective);
                const scores = axisScores(build, stats);
                const values = [scores.dps, scores.magazineCapacity, scores.speed, scores.recoil, scores.magDamage];
                const min = Math.min(...values);
                const average = values.reduce((total, value) => total + value, 0) / values.length;
                if (min > bestMin || (min === bestMin && average > bestAverage)) {
                    best = build;
                    bestMin = min;
                    bestAverage = average;
                }
            }
            if (best !== null) entries.push({ build: best, value: bestMin, average: bestAverage });
        } else {
            const build = buildForGun(store, gun, objective);
            entries.push({ build, value: objectiveValue(build, objective), average: 0 });
        }
    }
    entries.sort((a, b) => b.value - a.value || b.average - a.average);
    return entries.slice(0, limit);
}

export function bestBuild(
    store: HephaestusStore,
    objective: HephaestusObjective,
    gun?: HephaestusGun,
    pool?: Iterable<HephaestusGun>,
    stats?: HephaestusAxisStats
): HephaestusBuild | null {
    const guns = gun !== undefined ? [gun] : (pool ?? store.guns.values());

    if (objective === 'overall') {
        if (stats === undefined) return null;
        let best: HephaestusBuild | null = null;
        let bestMin = Number.NEGATIVE_INFINITY;
        let bestAvg = Number.NEGATIVE_INFINITY;
        const buildObjectives: HephaestusObjective[] = ['dps', 'magazine', 'speed', 'recoil', 'magdamage'];
        for (const candidate of guns) {
            if (candidate.firerate <= 0 || candidate.damage <= 0) continue;
            for (const buildObjective of buildObjectives) {
                const build = buildForGun(store, candidate, buildObjective);
                const scores = axisScores(build, stats);
                const values = [scores.dps, scores.magazineCapacity, scores.speed, scores.recoil, scores.magDamage];
                const min = Math.min(...values);
                const avg = values.reduce((total, value) => total + value, 0) / values.length;
                if (min > bestMin || (min === bestMin && avg > bestAvg)) {
                    best = build;
                    bestMin = min;
                    bestAvg = avg;
                }
            }
        }
        return best;
    }

    let best: HephaestusBuild | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
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

function lowerBound(sorted: number[], value: number): number {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (sorted[mid] < value) low = mid + 1;
        else high = mid;
    }
    return low;
}

function upperBound(sorted: number[], value: number): number {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (sorted[mid] <= value) low = mid + 1;
        else high = mid;
    }
    return low;
}

function axisPercentile(sorted: number[], value: number, higherBetter: boolean): number {
    const n = sorted.length;
    if (n === 0) return 0;
    const lower = lowerBound(sorted, value);
    const upper = upperBound(sorted, value);
    const base = higherBetter ? lower : n - upper;
    return ((base + 0.5 * (upper - lower)) / n) * 100;
}

export function axisScores(build: HephaestusBuild, stats: HephaestusAxisStats): HephaestusAxisScores {
    return {
        dps: axisPercentile(stats.dps, build.dps, true),
        magazineCapacity: axisPercentile(stats.magazineCapacity, build.magazineCapacity, true),
        speed: axisPercentile(stats.speed, build.speed, true),
        recoil: axisPercentile(stats.recoil, build.recoil, false),
        magDamage: axisPercentile(stats.magDamage, build.magDamage, true)
    };
}

export function computeAxisStats(store: HephaestusStore, pool: Iterable<HephaestusGun>): HephaestusAxisStats {
    const dps: number[] = [];
    const magazineCapacity: number[] = [];
    const speed: number[] = [];
    const recoil: number[] = [];
    const magDamage: number[] = [];

    for (const gun of pool) {
        if (gun.firerate <= 0 || gun.damage <= 0) continue;
        const dpsBuild = buildForGun(store, gun, 'dps');
        dps.push(dpsBuild.dps);
        magDamage.push(dpsBuild.magDamage);
        magazineCapacity.push(buildForGun(store, gun, 'magazine').magazineCapacity);
        speed.push(buildForGun(store, gun, 'speed').speed);
        recoil.push(buildForGun(store, gun, 'recoil').recoil);
    }

    const sortAscending = (values: number[]) => values.sort((a, b) => a - b);
    return {
        dps: sortAscending(dps),
        magazineCapacity: sortAscending(magazineCapacity),
        speed: sortAscending(speed),
        recoil: sortAscending(recoil),
        magDamage: sortAscending(magDamage)
    };
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
