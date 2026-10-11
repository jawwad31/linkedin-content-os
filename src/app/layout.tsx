import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Google Sans (Avelune brand typeface, OFL) as a 30 KB Latin, weight 400-700 subset
// of the supplied variable font; the full file is 4.8 MB and stays out of the app.
const googleSans = localFont({
  src: "./fonts/google-sans-latin.woff2",
  variable: "--font-google-sans",
  weight: "400 700",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Virel",
  description:
    "ICP-first LinkedIn content operating system for B2B operators and founders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${googleSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
