import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Book Pricing Dashboard",
  description: "Compare live and cached book prices across Indian bookstores.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
