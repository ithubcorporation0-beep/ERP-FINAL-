import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: siteConfig.name, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans antialiased", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
