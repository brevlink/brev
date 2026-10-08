"""Self-contained public page, identical for every unavailable short link."""

LINK_UNAVAILABLE_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>This link is unavailable · Brev</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px 16px;
      background: #f8f1e6;
      color: #071936;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    main {
      width: 100%;
      max-width: 480px;
      padding: clamp(24px, 6vw, 48px);
      background: #fffaf1;
      border: 1px solid rgba(7,25,54,0.14);
      border-radius: 24px;
      overflow-wrap: anywhere;
    }
    .brand { margin: 0 0 32px; font-size: 24px; font-weight: 750; letter-spacing: -1px; }
    h1 { margin: 0; font-size: clamp(28px, 6vw, 36px); line-height: 1.15; letter-spacing: -1px; }
    .explanation { margin: 16px 0 24px; color: #38516f; font-size: 16px; }
    a {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      color: #071936;
      font-weight: 600;
      text-underline-offset: 4px;
    }
    a:hover { color: #38516f; }
    a:focus-visible { outline: 2px solid #071936; outline-offset: 4px; border-radius: 2px; }
  </style>
</head>
<body>
  <main>
    <p class="brand">Brev</p>
    <h1>This link is unavailable</h1>
    <p class="explanation">We can’t open this short link.</p>
    <a href="https://brevl.ink" rel="noreferrer">Learn about Brev</a>
  </main>
</body>
</html>
"""
