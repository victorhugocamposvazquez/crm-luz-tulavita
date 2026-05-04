/**
 * Registro Web Push (VAPID) para recordatorios con el navegador cerrado.
 * Requiere VITE_VAPID_PUBLIC_KEY y secrets en la Edge Function send-reminder-web-push.
 */

import { supabase } from '@/integrations/supabase/client';

export function webPushEnvConfigured(): boolean {
  const k = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  return typeof k === 'string' && k.trim().length > 20;
}

export function webPushApiSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeReminderWebPush(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!webPushApiSupported()) {
    return { ok: false, error: 'Tu navegador no soporta notificaciones push.' };
  }
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapid?.trim()) {
    return { ok: false, error: 'Falta VITE_VAPID_PUBLIC_KEY en el despliegue del CRM.' };
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return { ok: false, error: 'Permiso de notificaciones denegado.' };
  }

  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await reg.update();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.trim()),
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, error: 'No se pudo obtener la suscripción push.' };
  }

  const { error } = await supabase.from('admin_web_push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function unsubscribeReminderWebPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await supabase.from('admin_web_push_subscriptions').delete().eq('endpoint', endpoint);
    await sub.unsubscribe();
  } catch {
    // ignorar
  }
}
