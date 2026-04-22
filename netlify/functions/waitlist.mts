import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const { email } = await req.json()
  if (!email || !email.includes('@')) return new Response('Invalid email', { status: 400 })

  const store = getStore('waitlist')
  await store.setJSON(`${Date.now()}-${email}`, { email, signedUpAt: new Date().toISOString() })
  return Response.json({ success: true })
}

export const config = { path: '/.netlify/functions/waitlist' }