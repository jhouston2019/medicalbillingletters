Government Contract Bid Review Pro
==================================

This folder contains a microsite for small businesses that want a non-legal, content-focused review of a government bid package before submission.

Files
-----

- `index.html` – Landing page describing the bid review service, process, and pricing.
- `intake.html` – Intake form for solicitation details, draft access, and focus areas.
- `thank-you.html` – Generic confirmation page after intake submission.
- `style.css` – Imports shared styles from the parent template (`../style.css`).
- `script.js` – Uses shared JavaScript from `../script.js`.

Form Endpoint
-------------

The intake form posts to a placeholder Formspree endpoint:

- `https://formspree.io/f/PLACEHOLDER`

Replace `PLACEHOLDER` with your actual Formspree form ID before going live.

Payment Links
-------------

On `index.html`, update:

- **PayPal**: Replace `https://paypal.me/YOUR-GOVBID-LINK` with your PayPal payment link.
- **Venmo**: Replace `@yourvenmohandle` with your real Venmo handle.
- Extend the payment section if you also accept ACH, credit cards, or invoices.

Deployment
----------

This is a static HTML/CSS/JS microsite. Deploy it as:

- A Netlify / Vercel site (publish directory = this folder).
- A GitHub Pages site pointing at this folder.
- A subdirectory or subdomain of an existing site.

If your deployment doesn’t include the parent template files, copy `../style.css` and `../script.js` into this folder so the site is fully self-contained.


