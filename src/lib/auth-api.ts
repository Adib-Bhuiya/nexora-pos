import type { User } from '@/types';

export interface AuthStatusResponse {
  success: boolean;
  initialized: boolean;
  authenticated: boolean;
  user: User | null;
  message?: string;
}

export interface SetupOwnerInput {
  setupKey: string;
  name: string;
  email: string;
  password: string;
  pin?: string;
}

export interface LoginOwnerInput {
  email: string;
  password: string;
}

export interface LoginPinInput {
  userId: string;
  pin: string;
}

export interface CreateCashierInput {
  name: string;
  pin: string;
}

export interface UpdateUserInput {
  name?: string;
  active?: boolean;
  pin?: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    success?: boolean;
    message?: string;
  };

  if (!response.ok || data.success === false) {
    throw new Error(data.message || 'Authentication request failed.');
  }

  return data;
}

export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  const response = await fetch('/api/auth/status', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  return readResponse<AuthStatusResponse>(response);
}

export async function setupOwnerApi(input: SetupOwnerInput): Promise<User> {
  const response = await fetch('/api/auth/setup-owner', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(input),
  });

  const data = await readResponse<{ success: boolean; user: User }>(response);
  return data.user;
}

export async function loginOwnerApi(input: LoginOwnerInput): Promise<User> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(input),
  });

  const data = await readResponse<{ success: boolean; user: User }>(response);
  return data.user;
}

export async function loginPinApi(input: LoginPinInput): Promise<User> {
  const response = await fetch('/api/auth/pin-login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(input),
  });

  const data = await readResponse<{ success: boolean; user: User }>(response);
  return data.user;
}

export async function logoutApi(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
  });

  await readResponse<{ success: boolean }>(response);
}

export async function fetchUsersApi(): Promise<User[]> {
  const response = await fetch('/api/users', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const data = await readResponse<{ success: boolean; users: User[] }>(response);
  return data.users ?? [];
}

export async function createCashierApi(input: CreateCashierInput): Promise<User> {
  const response = await fetch('/api/users', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(input),
  });

  const data = await readResponse<{ success: boolean; user: User }>(response);
  return data.user;
}

export async function updateUserApi(id: string, input: UpdateUserInput): Promise<User> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(input),
  });

  const data = await readResponse<{ success: boolean; user: User }>(response);
  return data.user;
}

export async function deleteUserApi(id: string): Promise<void> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'NexoraPOS',
    },
  });

  await readResponse<{ success: boolean }>(response);
}

export async function forgotPasswordApi(email: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify({ email }),
  });

  return readResponse<{ success: boolean; message: string }>(response);
}

export async function resetPasswordApi(input: {
  token: string;
  password: string;
  confirmPassword?: string;
}): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(input),
  });

  return readResponse<{ success: boolean; message: string }>(response);
}

export async function resetCashierPinApi(
  userId: string,
  input: { pin: string; confirmPin?: string }
): Promise<User> {
  const response = await fetch(`/api/users/${encodeURIComponent(userId)}/reset-pin`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(input),
  });

  const data = await readResponse<{ success: boolean; user: User }>(response);
  return data.user;
}

