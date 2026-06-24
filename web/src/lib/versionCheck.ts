// ─── Version Check ───────────────────────────────────────────────────────────
// On each deploy, GitHub Actions writes dist/version.json with the commit SHA.
// The build also embeds that SHA as VITE_APP_VERSION.
// On startup (and every 5 min / tab-focus), the app fetches version.json and
// compares. If different → show the "update available" banner.
// When the user confirms the update, we wipe localStorage first to avoid stale
// Zustand data, then hard-reload so the browser fetches the new HTML/JS.
// ─────────────────────────────────────────────────────────────────────────────

import { CLOUD_STORAGE_KEY } from '../store/cloudStorage';

const CURRENT_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';

interface VersionInfo {
    version: string;
    deployedAt?: string;
}

/**
 * Fetches the deployed version.json (cache-busted) and returns true when a
 * newer version is available. Always returns false in local dev or on any
 * network error so we never prompt unnecessarily.
 */
export async function checkForUpdate(): Promise<boolean> {
    // Skip in local dev (no version embedded) or when version.json can't exist.
    if (CURRENT_VERSION === 'dev') return false;

    try {
        // BASE_URL is './' in dev, '/ElJardinERPWeb/' in the GitHub Pages build.
        const url = `${import.meta.env.BASE_URL}version.json`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const resp = await fetch(url, {
            cache: 'no-store', // always bypass cache
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!resp.ok) return false;

        const data: VersionInfo = await resp.json();
        return !!data.version && data.version !== CURRENT_VERSION;
    } catch {
        // Network error, abort, JSON parse error — silently skip.
        return false;
    }
}

/**
 * Wipes the local Zustand cache so the next load re-hydrates fresh from
 * Supabase (prevents stale-schema issues after deployments), then hard-reloads.
 */
export function applyUpdate(): void {
    try {
        localStorage.removeItem(CLOUD_STORAGE_KEY);
    } catch { /* storage may be unavailable in some edge cases */ }
    window.location.reload();
}
