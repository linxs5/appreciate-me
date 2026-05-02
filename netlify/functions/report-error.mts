import { getStore } from '@netlify/blobs'

type ErrorReportInput = {
  message: string
  stack?: string
  page?: string
  userAgent?: string
  extra?: unknown
  createdAt: string
}

function cleanString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 4000) : fallback
}

function normalizeReport(value: unknown): ErrorReportInput {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const message = cleanString(body.message)
  if (!message) throw new Error('Missing message')

  const createdAt = cleanString(body.createdAt, new Date().toISOString())
  return {
    message,
    stack: cleanString(body.stack) || undefined,
    page: cleanString(body.page) || undefined,
    userAgent: cleanString(body.userAgent) || undefined,
    extra: body.extra,
    createdAt,
  }
}

export default async (req: Request) => {
  try {
    const store = getStore('error-reports')

    if (req.method === 'POST') {
      let report: ErrorReportInput
      try {
        report = normalizeReport(await req.json())
      } catch {
        return new Response('Invalid error report payload.', { status: 400 })
      }

      const id = `${Date.now()}-${crypto.randomUUID()}`
      await store.setJSON(id, { id, ...report })
      return Response.json({ ok: true, id }, { status: 201 })
    }

    if (req.method === 'GET') {
      const adminKey = process.env.ERROR_REPORT_ADMIN_KEY
      const url = new URL(req.url)
      const providedKey =
        req.headers.get('x-admin-key') ||
        req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
        url.searchParams.get('adminKey')

      if (!adminKey || providedKey !== adminKey) {
        return new Response('Forbidden', { status: 403 })
      }

      const { blobs } = await store.list()
      const reports = await Promise.all(
        blobs.map(async blob => store.get(blob.key, { type: 'json' }))
      )
      return Response.json(
        reports
          .filter(Boolean)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      )
    }

    return new Response('Method not allowed', { status: 405 })
  } catch {
    return new Response('Failed to process error report request', { status: 500 })
  }
}

export const config = { path: '/.netlify/functions/report-error' }
