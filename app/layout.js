export const metadata = {
  title: "每日日报统计"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/styles.css?v=20260710-api-1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
