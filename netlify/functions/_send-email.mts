type WelcomeEmailInput = {
  to: string
  username?: string
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function appUrl(path = '') {
  const baseUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '')
  return baseUrl ? `${baseUrl}${path}` : ''
}

function welcomeEmailHtml(username: string, garageUrl: string) {
  const safeUsername = escapeHtml(username)
  const safeGarageUrl = escapeHtml(garageUrl)

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a09;color:#f5f5ef;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a09;padding:32px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#111110;border:1px solid #262622;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 20px;border-bottom:1px solid #262622;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width:44px;height:44px;border-radius:12px;background:#00e87a;color:#0a0a09;font-weight:800;font-size:16px;letter-spacing:1px;text-align:center;vertical-align:middle;">AM</td>
                    <td style="padding-left:12px;color:#f5f5ef;font-size:16px;font-weight:800;letter-spacing:2px;">APPRECIATE ME</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 28px 10px;">
                <div style="color:#00e87a;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Track your car like an asset.</div>
                <h1 style="margin:0 0 18px;color:#ffffff;font-size:38px;line-height:1.02;font-weight:800;letter-spacing:.5px;">Your garage is ready.</h1>
                <p style="margin:0;color:#c9c9bf;font-size:16px;line-height:1.65;">
                  Welcome to Appreciate Me, ${safeUsername}. Your account is ready. Start tracking your vehicle like an asset and building a proof-backed record your next buyer can trust.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 18px;">
                <a href="${safeGarageUrl}" style="display:inline-block;background:#00e87a;color:#0a0a09;text-decoration:none;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;border-radius:6px;padding:14px 18px;">Open Your Garage</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:12px 0;border-top:1px solid #262622;color:#f5f5ef;font-size:14px;">✓ <span style="color:#c9c9bf;">Track maintenance and upgrades</span></td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;border-top:1px solid #262622;color:#f5f5ef;font-size:14px;">✓ <span style="color:#c9c9bf;">Build proof-backed vehicle history</span></td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;border-top:1px solid #262622;border-bottom:1px solid #262622;color:#f5f5ef;font-size:14px;">✓ <span style="color:#c9c9bf;">Share a buyer-ready proof packet</span></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 28px;color:#00e87a;font-size:13px;letter-spacing:1px;font-weight:700;">
                Stop getting lowballed. Prove what you&rsquo;ve done.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function welcomeEmailText(username: string, garageUrl: string) {
  return `Welcome to Appreciate Me, ${username}.
Your account is ready.
Open your garage: ${garageUrl}
Stop getting lowballed. Prove what you’ve done.`
}

export async function sendWelcomeEmail({ to, username }: WelcomeEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.EMAIL_FROM?.trim()
  const garageUrl = appUrl('/app')

  if (!apiKey || !from || !garageUrl) {
    console.warn('welcome email skipped: missing RESEND_API_KEY, EMAIL_FROM, or APP_BASE_URL')
    return { ok: false, skipped: true }
  }

  const displayName = username?.trim() || 'driver'
  const payload = {
    from,
    to,
    subject: 'Welcome to Appreciate Me',
    html: welcomeEmailHtml(displayName, garageUrl),
    text: welcomeEmailText(displayName, garageUrl),
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.warn('welcome email failed: Resend returned a non-2xx response', {
        status: response.status,
        body: errorBody.slice(0, 500),
      })
      return { ok: false, skipped: false }
    }

    return { ok: true, skipped: false }
  } catch (error) {
    console.warn('welcome email failed: Resend request error', {
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return { ok: false, skipped: false }
  }
}
