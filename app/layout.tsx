import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Слово · Перевод богослужения', description: 'Пульт перевода русской речи и экран субтитров для OBS.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="ru"><body>{children}</body></html>; }
