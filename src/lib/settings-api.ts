import type { Settings } from '@/types';

interface SettingsResponse {
  success: boolean;
  settings?: Settings;
  message?: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    success?: boolean;
    message?: string;
  };

  if (!response.ok || data.success === false) {
    throw new Error(data.message || 'Settings request failed.');
  }

  return data;
}

export async function fetchSettings(): Promise<Settings> {
  const response = await fetch('/api/settings', {
    method: 'GET',
    cache: 'no-store',
  });

  const data = await readResponse<SettingsResponse>(response);

  if (!data.settings) {
    throw new Error('The server did not return settings.');
  }

  return data.settings;
}

export async function saveSettingsApi(settings: Settings): Promise<Settings> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(settings),
  });

  const data = await readResponse<SettingsResponse>(response);

  if (!data.settings) {
    throw new Error('The server did not return the updated settings.');
  }

  return data.settings;
}

