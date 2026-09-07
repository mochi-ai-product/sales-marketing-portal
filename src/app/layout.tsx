import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sales & Marketing Portal',
  description: 'A&D Technologies - Sales & Marketing SaaS portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
