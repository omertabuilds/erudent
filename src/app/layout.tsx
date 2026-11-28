import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Erudent",
  description: "Ranked 1v1 math duels. Climb from Novice to Erudite.",
};

// Dark is the default. Before first paint: use the theme saved in Settings, otherwise light if the device asks for it.
// Then keep it in sync: when the device switches light/dark ("Device" choice) or another tab changes the setting.
// The key matches THEME_KEY in src/lib/preferences.ts.
const themeScript = `try{var k="erudent-theme",d=document.documentElement,m=matchMedia("(prefers-color-scheme: light)"),a=function(){try{var t=localStorage.getItem(k)}catch(e){}d.dataset.theme=t==="light"||t==="dark"?t:m.matches?"light":"dark"};a();m.addEventListener("change",a);addEventListener("storage",function(e){if(e.key===k||e.key===null)a()})}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
