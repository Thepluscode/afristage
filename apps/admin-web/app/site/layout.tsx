import type { Metadata } from 'next';

// The public marketing/security pages live under app/, so without their own
// metadata they inherit the admin console's ("AfriStage Admin"). Give prospects
// a creator-facing title, description, and share cards instead.
export const metadata: Metadata = {
  title: 'AfriStage — Africa’s live stage for creators',
  description:
    'Live streaming built for African creators: perform for the whole continent and its diaspora, keep 60% of every gift, and get paid on rails that reach home.',
  openGraph: {
    type: 'website',
    title: 'AfriStage — Africa’s live stage for creators',
    description:
      'Live streaming built for African creators: keep 60% of every gift and get paid on rails that reach home.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AfriStage — Africa’s live stage for creators',
    description:
      'Live streaming built for African creators: keep 60% of every gift and get paid on rails that reach home.',
  },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
