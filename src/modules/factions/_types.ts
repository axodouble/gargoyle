export const GUILD_ID = '1442961061207736672';
export const DEFAULT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
export const MAX_QUESTIONS = 20;
export const QUESTIONS_PER_PAGE = 5;

export function parseDuration(input: string): number | null {
    const trimmed = input.trim().toLowerCase();
    if (trimmed === '0') {
        return 0;
    }
    const pattern = /^(\d+)([hd])$/;
    const match = pattern.exec(trimmed);
    if (!match) {
        return null;
    }
    const value = parseInt(match[1], 10);
    return match[2] === 'h' ? value * 60 * 60 * 1000 : value * 24 * 60 * 60 * 1000;
}
