import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { StarknetProvider } from "./providers";
import { Navbar } from "@/components/Navbar";

const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SIEGE — Trust Your AI",
  description: "A strategic commit-reveal game on Starknet. Team up with your AI agent. Attack or defend. Trust is everything.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${mono.variable} font-mono antialiased bg-[#0a0a0f] text-[#e0e0e8] min-h-screen`}>
        <StarknetProvider>
          <Navbar />
          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        </StarknetProvider>
      </body>
    </html>
  );
}
