Contractor Estimate Review Pro
==============================

This folder contains a microsite for homeowners and small business owners who want a plain-English review of a contractor estimate before signing.

Files
-----

- `index.html` – Landing page explaining the estimate review service, process, and pricing.
- `intake.html` – Intake form to collect your project details and contractor estimate.
- `thank-you.html` – Confirmation page after intake submission.
- `style.css` – Imports the shared styles from the parent template (`../style.css`).
- `script.js` – Uses the shared JavaScript from `../script.js`.

Form Endpoint
-------------

The intake form currently posts to a placeholder Formspree endpoint:

- `https://formspree.io/f/PLACEHOLDER`

Replace `PLACEHOLDER` with your real Formspree form ID before going live.

Payment Links
-------------

On `index.html`, update:

- **PayPal**: Replace `https://paypal.me/YOUR-CONTRACTOR-ESTIMATE-LINK` with your live PayPal link.
- **Venmo**: Replace `@yourvenmohandle` with your real Venmo handle.
- Add or adjust any Stripe / ACH / invoice instructions in the payment block.

Deployment
----------

This is a static HTML/CSS/JS microsite. You can deploy it as:

- A Netlify / Vercel site using this folder as the publish directory.
- A GitHub Pages site pointing to this folder.
- A subdirectory or subdomain of your main domain.

If your host does not ship the parent `ServiceSiteTemplate` files, copy `../style.css` and `../script.js` into this folder so the site remains fully self-contained.


