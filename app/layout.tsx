import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MyRides - Ride Hailing & Delivery Platform',
  description: 'Production-ready ride-hailing and delivery platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
