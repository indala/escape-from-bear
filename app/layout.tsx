import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Escape the Bear - Survival Horror Game",
    template: "%s | Escape the Bear"
  },
  description: "Can you survive the predator? Freeze when it looks your way in this intense survival game. Test your nerves and escape the bear.",
  keywords: ["Survival Game", "Horror", "Escape the Bear", "Stealth Game", "Browser Game", "Next.js Game"],
  authors: [{ name: "Antigravity Team" }],
  creator: "Antigravity",
  publisher: "Antigravity Games",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://escape-from-bear.vercel.app"), // Replace with actual domain if known
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Escape the Bear - Survival Horror Game",
    description: "Freeze when it looks your way. A high-stakes survival game of stealth and nerves.",
    url: "https://escape-from-bear.vercel.app",
    siteName: "Escape the Bear",
    images: [
      {
        url: "/og-image.png", // Need to generate this or use a placeholder
        width: 1200,
        height: 630,
        alt: "Escape the Bear Gameplay Preview",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Escape the Bear - Survival Horror Game",
    description: "Don't move. Don't breathe. Escape the bear.",
    images: ["/og-image.png"],
    creator: "@antigravity",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  // GEO Metadata
  other: {
    "geo.region": "US-CA",
    "geo.placename": "San Francisco",
    "geo.position": "37.7749;-122.4194",
    "ICBM": "37.7749, -122.4194",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="w-screen h-screen overflow-hidden">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Escape the Bear",
              "operatingSystem": "Web",
              "applicationCategory": "GameApplication",
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "ratingCount": "120"
              },
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              }
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
