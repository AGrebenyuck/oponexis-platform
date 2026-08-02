import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
	title: "Oponexis Platform",
	icons: {
		icon: 'https://www.oponexis.pl/siteIcon/favicon.ico',
		apple: 'https://www.oponexis.pl/siteIcon/icon.svg',
	},
  description: "Platforma operacyjna Oponexis",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
