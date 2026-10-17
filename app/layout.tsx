import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono } from "next/font/google";
import { THEME_SCRIPT } from "@/components/ui/theme-toggle";
import "./globals.css";

// Figtree: a free geometric sans, close in feel to the font the design system
// was drawn with.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "RCW Media",
    template: "%s · RCW Media",
  },
  description:
    "Where the RCW media team uploads, finds and hands off photos and videos from every service.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1022" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${geistMono.variable} h-full antialiased`}
      // The theme script sets data-theme before React loads.
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved light or dark choice before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
