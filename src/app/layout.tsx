import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sentinel",
  description:
    "Sentinel — intelligent monitoring, risk detection and transparency platform.",

  keywords: [
    "Sentinel",
    "MPLAD",
    "risk detection",
    "fraud detection",
    "transparency",
    "monitoring",
    "audit",
  ],

  authors: [
    {
      name: "Sentinel Team",
    },
  ],

  applicationName: "Sentinel",

  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },

  openGraph: {
    title: "Sentinel",
    description:
      "Intelligent monitoring, risk detection and transparency platform.",
    siteName: "Sentinel",
    type: "website",
  },

  twitter: {
    card: "summary",
    title: "Sentinel",
    description:
      "Intelligent monitoring, risk detection and transparency platform.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}

        <Toaster />
      </body>
    </html>
  );
}