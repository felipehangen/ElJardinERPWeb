import { supabase } from './supabase';

// ── Realtime sync (Paso 3) ──────────────────────────────────────────────────
// Lightweight cross-client ping so other open windows/devices refresh
// automatically instead of waiting for visibilitychange or a manual 🔄.
//
// Uses Realtime BROADCAST (not postgres_changes): the state document is large,
// so we only announce "a save happened at <ts>" and receivers pull via the
// normal syncFromCloud path (force refresh + union-merge + rehydrate). The
// payload carries no business data — RLS still guards every actual read/write.
// Broadcast does not echo to the sender (self: false by default), so a window
// never reacts to its own save; a missed ping (device asleep/offline) is
// covered by the existing visibilitychange auto-sync.

const CHANNEL = 'erp-state-sync';
const EVENT = 'state-saved';

let channel: ReturnType<typeof supabase.channel> | null = null;

// Subscribe to remote-save pings. Returns a cleanup function.
export function initRealtimeSync(onRemoteSave: (ts: string | null) => void): () => void {
    try {
        channel = supabase.channel(CHANNEL);
        channel
            .on('broadcast', { event: EVENT }, (msg: any) => {
                onRemoteSave((msg?.payload?.ts as string | undefined) ?? null);
            })
            .subscribe();
    } catch {
        channel = null; // realtime unavailable — app works exactly as before
    }
    return () => {
        try { if (channel) supabase.removeChannel(channel); } catch { /* noop */ }
        channel = null;
    };
}

// Announce a successful cloud save. Fire-and-forget: a lost ping only means
// the other window refreshes later via the existing fallbacks.
export function announceSave(ts: string): void {
    try {
        channel?.send({ type: 'broadcast', event: EVENT, payload: { ts } });
    } catch { /* noop — never let realtime break a save */ }
}
