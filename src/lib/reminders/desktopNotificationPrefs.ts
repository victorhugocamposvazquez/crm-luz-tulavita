export const REMINDER_DESKTOP_PREF_KEY = 'crm_reminder_desktop_enabled';

export function getReminderDesktopNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(REMINDER_DESKTOP_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setReminderDesktopNotificationsEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(REMINDER_DESKTOP_PREF_KEY, 'true');
    } else {
      localStorage.removeItem(REMINDER_DESKTOP_PREF_KEY);
    }
    window.dispatchEvent(new Event('crm-reminder-desktop-pref'));
  } catch {
    // ignore
  }
}

export function desktopNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}
