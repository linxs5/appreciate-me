type AiEvaluation = {
  generatedAt: string
  overallSummary: string
  marketPosition: string
  conditionSummary: string
  proofStrength: string
  risks: string[]
  recommendedNextSteps: string[]
}

function trimText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function trimList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  const cleaned = value
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => item.trim())
    .slice(0, 6)
  return cleaned.length ? cleaned : fallback
}

function buildEvaluation(value: unknown): AiEvaluation {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    generatedAt: new Date().toISOString(),
    overallSummary: trimText(data.overallSummary, 'No summary was generated.'),
    marketPosition: trimText(data.marketPosition, 'Market position could not be determined from the provided data.'),
    conditionSummary: trimText(data.conditionSummary, 'Condition could not be determined from the provided data.'),
    proofStrength: trimText(data.proofStrength, 'Proof strength could not be determined from the provided data.'),
    risks: trimList(data.risks, ['Insufficient information to identify specific risks.']),
    recommendedNextSteps: trimList(data.recommendedNextSteps, ['Add more vehicle details, service records, condition notes, and comparable sales.']),
  }
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response('Missing OPENAI_API_KEY environment variable.', { status: 500 })
  }

  let vehicle: unknown
  try {
    const body = await req.json()
    vehicle = body?.vehicle ?? body
  } catch {
    return new Response('Invalid JSON body.', { status: 400 })
  }

  if (!vehicle || typeof vehicle !== 'object') {
    return new Response('Missing vehicle JSON in POST body.', { status: 400 })
  }

  const prompt = `You are an automotive asset evaluation assistant.

Important constraints:
- Do not claim to be a certified appraisal.
- Base every conclusion only on the vehicle data provided.
- Do not invent history, comps, records, options, condition, or market facts.
- Consider vehicle info, market comps, sold vs asking comps, condition checkup, proof files, logs, value impact, and ownership documentation.
- Be concise, practical, and buyer/seller oriented.

Return only JSON with these keys:
{
  "overallSummary": string,
  "marketPosition": string,
  "conditionSummary": string,
  "proofStrength": string,
  "risks": string[],
  "recommendedNextSteps": string[]
}`

  try {
    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_EVALUATION_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify(vehicle) },
        ],
      }),
    })

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text().catch(() => '')
      return new Response(errorText || 'OpenAI request failed.', { status: 502 })
    }

    const completion = await openAiResponse.json()
    const content = completion?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return new Response('OpenAI response did not include evaluation content.', { status: 502 })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return new Response('OpenAI response was not valid JSON.', { status: 502 })
    }

    return Response.json(buildEvaluation(parsed))
  } catch {
    return new Response('Failed to generate AI evaluation.', { status: 500 })
  }
}

export const config = { path: '/.netlify/functions/generate-ai-evaluation' }
