import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import stylesheet from './styles/app.css';

export const links = () => [{ rel: 'stylesheet', href: stylesheet }];

export const meta = () => [
  { charSet: 'utf-8' },
  { title: 'JobNest' },
  { name: 'viewport', content: 'width=device-width,initial-scale=1' },
  { name: 'description', content: 'JobNest monorepo frontend (Remix)' },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <main className="shell">
          <Outlet />
        </main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
