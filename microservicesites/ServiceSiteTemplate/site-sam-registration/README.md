SAM.gov Registration Fix Service
================================

This folder contains a microsite for businesses and organizations that need help untangling SAM.gov registration issues and delays.

Files
-----

- `index.html` – Landing page describing the SAM.gov fix service, process, and pricing.
- `intake.html` – Intake form to collect details about your SAM.gov status and problems.
- `thank-you.html` – Confirmation page after the intake form is submitted.
- `style.css` – Imports shared styles from the parent template (`../style.css`).
- `script.js` – Uses shared JavaScript from `../script.js`.

Form Endpoint
-------------

The intake form posts to a placeholder Formspree endpoint:

- `https://formspree.io/f/PLACEHOLDER`

Replace `PLACEHOLDER` with your own Formspree form ID before going live.

Payment Links
-------------

On `index.html`, update:

- **PayPal**: Replace `https://paypal.me/YOUR-SAMFIX-LINK` with your PayPal payment link.
- **Venmo**: Replace `@yourvenmohandle` with your real Venmo handle.
- Customize the payment section if you also accept ACH, cards, or invoices.

Deployment
----------

This is a static HTML/CSS/JS microsite. You can deploy it as:

- A Netlify / Vercel site with this folder as the publish directory.
- A GitHub Pages site that uses this folder as the root.
- A subdirectory or subdomain of your main website.

If your deployment does not include the parent template files, copy `../style.css` and `../script.js` into this folder so the microsite remains fully self-contained.


