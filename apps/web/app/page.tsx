import { redirect } from 'next/navigation';

/** The dashboard owns the app; the middleware sends anonymous visitors to /login. */
export default function RootPage() {
  redirect('/dashboard');
}
