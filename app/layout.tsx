import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '詐欺検出アシスタント',
  description: '画像やテキストから詐欺の可能性を分析し、人々を守るためのAIアシスタント',
  keywords: '詐欺検出, 高齢者保護, AI分析, セキュリティ, 画像認識',
  authors: [{ name: 'Spam Ditect Team' }],
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
