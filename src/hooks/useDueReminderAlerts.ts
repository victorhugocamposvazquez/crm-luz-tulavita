import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type DueReminderAlert = {
  id: string;
  reminder_date: string;
  reminder_kind: string | null;
  custom_label: string | null;
  client: { nombre_apellidos: string } | null;
};

const POLL_MS = 60_000;
const LIST_LIMIT = 15;

export function useDueReminderAlerts(enabled: boolean) {
  const [items, setItems] = useState<DueReminderAlert[]>([]);
  const [dueCount, setDueCount] = useState(0);

  const fetchDue = useCallback(async () => {
    if (!enabled) return;
    const nowIso = new Date().toISOString();
    try {
      const [listRes, countRes] = await Promise.all([
        supabase
          .from('renewal_reminders')
          .select('id, reminder_date, reminder_kind, custom_label, client:clients(nombre_apellidos)')
          .eq('status', 'pending')
          .lte('reminder_date', nowIso)
          .order('reminder_date', { ascending: true })
          .limit(LIST_LIMIT),
        supabase
          .from('renewal_reminders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .lte('reminder_date', nowIso),
      ]);

      if (!listRes.error && listRes.data) {
        setItems(listRes.data as DueReminderAlert[]);
      }
      if (!countRes.error && countRes.count != null) {
        setDueCount(countRes.count);
      }
    } catch (e) {
      console.error('useDueReminderAlerts:', e);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setDueCount(0);
      return;
    }
    void fetchDue();
    const t = setInterval(() => void fetchDue(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void fetchDue();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, fetchDue]);

  return { items, dueCount, refetch: fetchDue };
}
