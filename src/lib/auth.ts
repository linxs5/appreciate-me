import type { UserProfile } from './types'

const BASE = '/.netlify/functions'

async function authRequest<T>(action: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/auth?action=${action}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const message = await res.text().catch(() => '')
    throw new Error(message || 'Authentication request failed')
  }
  return res.json()
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const res = await fetch(`${BASE}/auth?action=me`)
  if (!res.ok) return null
  const data = await res.json()
  return data.user || null
}

export async function signUp(email: string, password: string): Promise<UserProfile> {
  const data = await authRequest<{ user: UserProfile }>('signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return data.user
}

export async function signIn(email: string, password: string): Promise<UserProfile> {
  const data = await authRequest<{ user: UserProfile }>('login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return data.user
}

export async function signOut(): Promise<void> {
  await fetch(`${BASE}/auth?action=logout`, { method: 'POST' })
}

export async function saveProfile(data: { username: string; displayName?: string }): Promise<UserProfile> {
  const result = await authRequest<{ user: UserProfile }>('profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
  return result.user
}
