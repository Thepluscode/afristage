import './globals.css';
import { AdminChrome } from './chrome';

export const metadata = { title: 'AfriStage Admin', description: 'Moderation, payouts and platform operations' };

// Apply the saved theme before first paint to avoid a light/dark flash.
const themeScript = `try{if(localStorage.getItem('afristage-admin-theme')==='light')document.documentElement.dataset.theme='light';}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AdminChrome>{children}</AdminChrome>
      </body>
    </html>
  );
}
