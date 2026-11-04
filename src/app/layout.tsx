import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Erudent",
  description: "Ranked 1v1 math duels. Climb from Novice to Erudite.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
