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
  title: "MPLAD Sentinel — AI Fraud Detection for MPLAD Scheme",
  description: "Ensemble ML + graph ring detection + tamper-evident audit trail for the MPLAD Scheme. Built for SIH26102.",
  keywords: ["MPLAD", "fraud detection", "MoSPI", "SIH", "AI", "graph analysis", "audit trail"],
  authors: [{ name: "MPLAD Sentinel Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "MPLAD Sentinel",
    description: "AI-powered fraud detection for the MPLAD Scheme",
    siteName: "MPLAD Sentinel",
    type: "website",
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
