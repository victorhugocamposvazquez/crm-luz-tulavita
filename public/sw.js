/* Service worker: Web Push para recordatorios CRM (scope /). */
self.addEventListener('push', (event) => {
  let payload = { title: 'Recordatorio CRM', body: '', url: '/dashboard' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = {
          title: typeof parsed.title === 'string' ? parsed.title : payload.title,
          body: typeof parsed.body === 'string' ? parsed.body : payload.body,
          url: typeof parsed.url === 'string' ? parsed.url : payload.url,
        };
      }
    }
  } catch (_) {
    const text = event.data ? event.data.text() : '';
    if (text) payload.body = text;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
      tag: 'crm-reminder',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = '/dashboard';
  const d = event.notification.data;
  if (typeof d === 'string') url = d;
  else if (d && typeof d === 'object' && 'url' in d && typeof d.url === 'string') url = d.url;
  const target = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === target && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    }),
  );
});
