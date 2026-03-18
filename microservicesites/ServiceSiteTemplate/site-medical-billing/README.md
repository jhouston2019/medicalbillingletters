Medical Billing Dispute Letter Service
=====================================

This folder contains a microsite for people who want help preparing a formal written dispute of confusing or incorrect medical bills.

Files
-----

- `index.html` – Landing page describing the medical billing dispute letter service, process, and pricing.
- `intake.html` – Intake form to collect details about the bill, insurance coverage, and what appears to be wrong.
- `thank-you.html` – Confirmation page after the intake form is submitted.
- `style.css` – Imports shared styles from the parent template (`../style.css`).
- `script.js` – Uses shared JavaScript from `../script.js`.

Form Endpoint
-------------

The intake form posts to a placeholder Formspree endpoint:

- `https://formspree.io/f/PLACEHOLDER`

Replace `PLACEHOLDER` with your real Formspree form ID before you go live.

Payment Links
-------------

On `index.html`, update:

- **PayPal**: Replace `https://paypal.me/YOUR-MEDBILL-LINK` with your PayPal payment link.
- **Venmo**: Replace `@yourvenmohandle` with your real Venmo handle.
- Adjust the payment section if you accept ACH, cards, or invoices.

Deployment
----------

This is a static HTML/CSS/JS microsite. You can deploy it as:

- A Netlify / Vercel site with this folder as the publish directory.
- A GitHub Pages site that uses this folder as the root.
- A subdirectory or subdomain of your main site.

If your deployment doesn’t include the parent template files, copy `../style.css` and `../script.js` into this folder so the site remains fully self-contained.


