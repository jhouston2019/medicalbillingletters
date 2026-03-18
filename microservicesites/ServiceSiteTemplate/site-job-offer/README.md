Job Offer Letter Review Pro
===========================

This folder contains a microsite for professionals who want a clear, plain-language summary of a job offer letter before accepting.

Files
-----

- `index.html` – Landing page for the job offer review service with process and pricing.
- `intake.html` – Intake form to collect offer details, priorities, and concerns.
- `thank-you.html` – Confirmation page after the intake form is submitted.
- `style.css` – Imports shared styles from the parent template (`../style.css`).
- `script.js` – Uses the shared JavaScript from `../script.js`.

Form Endpoint
-------------

The intake form uses a placeholder Formspree endpoint:

- `https://formspree.io/f/PLACEHOLDER`

Replace `PLACEHOLDER` with your real Formspree form ID before using this site in production.

Payment Links
-------------

On `index.html`, update:

- **PayPal**: Replace `https://paypal.me/YOUR-JOBOFFER-LINK` with your live PayPal link.
- **Venmo**: Replace `@yourvenmohandle` with your actual Venmo handle.
- Adjust or extend the payment section if you accept Stripe, bank transfer, or invoices.

Deployment
----------

This is a static HTML/CSS/JS microsite. Deploy it as:

- A Netlify / Vercel site with this folder as the publish directory.
- A GitHub Pages site pointed to this folder.
- A subdirectory or subdomain on your main website.

If your deployment does not include the parent template files, copy `../style.css` and `../script.js` into this folder so the microsite is fully self-contained.


