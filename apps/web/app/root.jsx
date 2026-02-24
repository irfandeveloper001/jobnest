import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import tailwindStylesheet from './tailwind.css';
import globalStylesheet from './styles/global.css';

export const links = () => [
  { rel: 'stylesheet', href: tailwindStylesheet },
  { rel: 'stylesheet', href: globalStylesheet },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
  },
];

export const meta = () => [
  { charSet: 'utf-8' },
  { title: 'JobNest' },
  { name: 'viewport', content: 'width=device-width,initial-scale=1' },
  { name: 'description', content: 'JobNest - Modern hiring and job application hub' },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body className="bg-background-light text-slate-900 antialiased">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
