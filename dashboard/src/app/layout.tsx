import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Listening Insights",
  description: "See when, what and how people listen, from the realtime music streaming pipeline.",
};

// Apply the saved theme before first paint so the page never flashes the wrong colors.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
