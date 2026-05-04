import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  getReminderDesktopNotificationsEnabled,
  desktopNotificationsSupported,
  REMINDER_DESKTOP_PREF_KEY,
} from '@/lib/reminders/desktopNotificationPrefs';
import { reminderKindDisplay } from '@/lib/reminders/reminderKinds';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const DEDUPE_KEY = 'crm_reminder_desktop_dedupe_ids';
const POLL_MS = 60_000;

function loadDedupeSet(): Set<string> {
  try {
    const raw = localStorage.getItem(DEDUPE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveDedupeSet(ids: Set<string>): void {
  try {
    localStorage.setItem(DEDUPE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

type DueRow = {
  id: string;
  reminder_date: string;
  notes: string | null;
  reminder_kind: string | null;
  custom_label: string | null;
  client: { nombre_apellidos: string } | null;
};

export function useReminderDesktopNotifications(isAdmin: boolean) {
  const dedupeRef = useRef<Set<string>>(loadDedupeSet());

  useEffect(() => {
    if (!isAdmin || !desktopNotificationsSupported()) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const pruneDedupe = (currentDueIds: Set<string>) => {
      const next = new Set<string>();
      for (const id of dedupeRef.current) {
        if (currentDueIds.has(id)) next.add(id);
      }
      dedupeRef.current = next;
      saveDedupeSet(next);
    };

    const run = async () => {
      if (cancelled) return;
      if (!getReminderDesktopNotificationsEnabled()) return;
      if (Notification.permission !== 'granted') return;

      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('renewal_reminders')
        .select(
          'id, reminder_date, notes, reminder_kind, custom_label, client:clients(nombre_apellidos)',
        )
        .eq('status', 'pending')
        .lte('reminder_date', nowIso);

      if (cancelled) return;

      if (error) return;

      if (!data?.length) {
        pruneDedupe(new Set());
        return;
      }

      const rows = data as DueRow[];
      const dueIds = new Set(rows.map((r) => r.id));
      pruneDedupe(dueIds);

      for (const row of rows) {
        if (dedupeRef.current.has(row.id)) continue;

        const clientName = row.client?.nombre_apellidos?.trim() || 'Cliente';
        const motivo = reminderKindDisplay(row.reminder_kind, row.custom_label);
        const cuando = format(new Date(row.reminder_date), "PPP 'a las' HH:mm", { locale: es });
        const note = row.notes?.trim() ? row.notes.trim().slice(0, 160) : '';
        const body = note
          ? `${clientName} — ${motivo}\n${cuando}\n${note}`
          : `${clientName} — ${motivo}\n${cuando}`;

        try {
          new Notification('Recordatorio CRM', {
            body,
            tag: `reminder-${row.id}`,
          });
          dedupeRef.current.add(row.id);
          saveDedupeSet(dedupeRef.current);
        } catch {
          // sin permiso efectivo u otro error del sistema
        }
      }
    };

    const arm = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (!getReminderDesktopNotificationsEnabled() || Notification.permission !== 'granted') {
        return;
      }
      void run();
      interval = setInterval(run, POLL_MS);
    };

    const onPref = () => arm();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };

    window.addEventListener('crm-reminder-desktop-pref', onPref);
    document.addEventListener('visibilitychange', onVisible);

    arm();

    const onStorage = (e: StorageEvent) => {
      if (e.key === REMINDER_DESKTOP_PREF_KEY) arm();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      window.removeEventListener('crm-reminder-desktop-pref', onPref);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
    };
  }, [isAdmin]);
}
