import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "BargainBindings — Book Price Index",
  description: "Compare live book prices across Indian bookstores. Track reading lists. Discover what the world is reading.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
