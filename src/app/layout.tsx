import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Appreciate Me',
  description: 'The maintenance record your next buyer will actually trust.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
