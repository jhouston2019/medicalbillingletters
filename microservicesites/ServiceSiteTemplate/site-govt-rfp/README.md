Government RFP Proposal Editing Pro
===================================

This folder contains a microsite for teams that want editing and polishing support for government RFP proposal drafts.

Files
-----

- `index.html` – Landing page describing the RFP editing service, process, and pricing.
- `intake.html` – Intake form for RFP details, draft access, and focus areas.
- `thank-you.html` – Confirmation page after the intake form is submitted.
- `style.css` – Imports shared styles from the parent template (`../style.css`).
- `script.js` – Uses shared JavaScript from `../script.js`.

Form Endpoint
-------------

The intake form posts to a placeholder Formspree endpoint:

- `https://formspree.io/f/PLACEHOLDER`

Replace `PLACEHOLDER` with your live Formspree form ID before using this site in production.

Payment Links
-------------

On `index.html`, update:

- **PayPal**: Replace `https://paypal.me/YOUR-GOVRFP-LINK` with your PayPal payment link.
- **Venmo**: Replace `@yourvenmohandle` with your actual Venmo handle.
- Extend or modify the payment section if you accept ACH, card, or invoice payments.

Deployment
----------

This is a static HTML/CSS/JS microsite. You can deploy it as:

- A Netlify / Vercel site with this folder as the publish directory.
- A GitHub Pages site pointed at this folder.
- A subdirectory or subdomain of your main website.

If your hosting setup doesn’t serve the parent template files, copy `../style.css` and `../script.js` into this folder so the microsite is fully self-contained.


