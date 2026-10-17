interface ClearResponse {
  success: boolean;
  message?: string;
}

export async function clearDatabaseApi(opts?: { resetSettings?: boolean }): Promise<void> {
  const response = await fetch('/api/clear-data', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(opts ?? {}),
  });

  const data = (await response.json()) as ClearResponse;

  if (!response.ok || data.success === false) {
    throw new Error(data.message || 'Failed to clear database.');
  }
}

