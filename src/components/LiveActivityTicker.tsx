'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'appreciate-me.live-activity-ticker-hidden'

const TICKER_ITEMS = [
  'BUILD IN PUBLIC · PROVE THE WORK',
  'NEW BUILD UPDATE · COMMUNITY GARAGE',
  'PROOF DROP ADDED · RECEIPTS / PHOTOS / LOGS',
  'BUYER-READY PROOF PACKETS',
  'TRACK YOUR CAR LIKE AN ASSET',
  'SHARE THE PROOF, NOT PRIVATE DATA',
]

export default function LiveActivityTicker() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(STORAGE_KEY) === 'true')
    } catch {
      setHidden(false)
    }
  }, [])

  function hideTicker() {
    setHidden(true)
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    } catch {}
  }

  if (hidden) return null

  return (
    <div className="live-activity-ticker" role="region" aria-label="Live activity ticker">
      <div className="ticker-viewport">
        <div className="ticker-track" aria-hidden="true">
          {[0, 1].map(group => (
            <div className="ticker-group" key={group}>
              {TICKER_ITEMS.map((item) => (
                <span className="ticker-item" key={`${group}-${item}`}>
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
        <span className="ticker-accessible-copy">{TICKER_ITEMS.join('. ')}</span>
      </div>

      <button type="button" className="ticker-dismiss" onClick={hideTicker} aria-label="Hide live activity ticker">
        X
      </button>
    </div>
  )
}
