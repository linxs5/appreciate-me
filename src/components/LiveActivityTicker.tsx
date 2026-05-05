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

  const tickerItems = [...TICKER_ITEMS, ...TICKER_ITEMS]

  return (
    <div className="live-activity-ticker" role="region" aria-label="Live activity ticker">
      <style jsx>{`
        .live-activity-ticker {
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          height: 32px;
          overflow: hidden;
          background: linear-gradient(90deg, #050505 0%, #0a0a09 45%, #050505 100%);
          border-bottom: 1px solid rgba(0, 232, 122, 0.16);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        .live-activity-ticker::before,
        .live-activity-ticker::after {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          z-index: 2;
          width: 42px;
          pointer-events: none;
        }

        .live-activity-ticker::before {
          left: 0;
          background: linear-gradient(90deg, #050505, rgba(5, 5, 5, 0));
        }

        .live-activity-ticker::after {
          right: 40px;
          background: linear-gradient(270deg, #050505, rgba(5, 5, 5, 0));
        }

        .ticker-viewport {
          flex: 1;
          min-width: 0;
          overflow: hidden;
        }

        .ticker-track {
          display: flex;
          align-items: center;
          width: max-content;
          animation: ticker-scroll 42s linear infinite;
          will-change: transform;
        }

        .ticker-item {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 0 18px;
          color: #00e87a;
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          line-height: 1;
          letter-spacing: 0.1em;
          white-space: nowrap;
          text-transform: uppercase;
        }

        .ticker-item::before {
          content: '';
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: #00e87a;
          box-shadow: 0 0 12px rgba(0, 232, 122, 0.7);
        }

        .ticker-dismiss {
          position: relative;
          z-index: 3;
          flex: 0 0 auto;
          width: 32px;
          height: 32px;
          border: none;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(5, 5, 5, 0.82);
          color: rgba(255, 255, 255, 0.62);
          cursor: pointer;
          font-family: 'DM Mono', monospace;
          font-size: 13px;
          line-height: 32px;
          transition: color 0.18s ease, background 0.18s ease;
        }

        .ticker-dismiss:hover,
        .ticker-dismiss:focus-visible {
          background: rgba(0, 232, 122, 0.08);
          color: #00e87a;
          outline: none;
        }

        @keyframes ticker-scroll {
          from {
            transform: translate3d(0, 0, 0);
          }
          to {
            transform: translate3d(-50%, 0, 0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ticker-track {
            width: 100%;
            animation: none;
            flex-wrap: nowrap;
          }

          .ticker-item:nth-child(n + 4) {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .live-activity-ticker {
            height: 30px;
          }

          .ticker-item {
            padding: 0 14px;
            font-size: 9px;
            letter-spacing: 0.08em;
          }

          .ticker-dismiss {
            width: 30px;
            height: 30px;
            line-height: 30px;
          }
        }
      `}</style>

      <div className="ticker-viewport">
        <div className="ticker-track" aria-hidden="true">
          {tickerItems.map((item, index) => (
            <span className="ticker-item" key={`${item}-${index}`}>
              {item}
            </span>
          ))}
        </div>
        <span className="sr-only">{TICKER_ITEMS.join('. ')}</span>
      </div>

      <button type="button" className="ticker-dismiss" onClick={hideTicker} aria-label="Hide live activity ticker">
        X
      </button>
    </div>
  )
}
