AutoClaimNavigatorAI — Refund Line Standardization Kit
Updated: 2025-08-22T17:47:01

What this includes
------------------
1) refund-note-snippet.html
   - One-paste snippet that adds a subtle, italic refund line with bilingual text.
   - Safe to paste near your pricing or footer sections.
   - Uses your existing CSS variables (e.g., --muted).

2) *-refund-standard.html files
   - Standardized versions of your HTML builds with the old red box replaced
     by the subtle line. Language toggles (EN/ES) are preserved.

How to use the snippet in any page
----------------------------------
Paste the contents of refund-note-snippet.html into your HTML (anywhere after <head>).
If your page already has the .refund-note style, you can paste only the <div> line.

Exact wording (do not edit for legal consistency)
-------------------------------------------------
EN: Digital Products Delivered Immediately — All Sales Are Final & Non-Refundable
ES: Productos digitales entregados de inmediato — Todas las ventas son finales y no reembolsables

Notes
-----
• Styling is minimal and inherits from your design tokens (no hard-coded colors).
• If you use language toggles, ensure the element keeps class="lang-text" and data-en/data-es attributes.
• This kit does not change any pricing or functional code.