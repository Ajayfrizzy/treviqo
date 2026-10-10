import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./public.css";
export const metadata: Metadata = {
  title: { default: "Treviqo", template: "%s · Treviqo" },
  description: "Your employment and benefits history belongs to you.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#123f35",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
