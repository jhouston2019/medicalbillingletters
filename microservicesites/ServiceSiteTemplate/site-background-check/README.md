Background Check Error Dispute Pro
=================================

This folder contains a microsite for people who need help disputing incorrect or outdated information on a background check report.

Files
-----

- `index.html` – Landing page explaining the background check dispute service, process, and pricing.
- `intake.html` – Intake form to collect details about the report and the errors you’ve identified.
- `thank-you.html` – Confirmation page after intake submission.
- `style.css` – Imports the shared styles from the parent template (`../style.css`).
- `script.js` – Uses the shared JavaScript from `../script.js`.

Form Endpoint
-------------

The intake form posts to a placeholder Formspree endpoint:

- `https://formspree.io/f/PLACEHOLDER`

Replace `PLACEHOLDER` with your actual Formspree form ID before going live.

Payment Links
-------------

On `index.html`, update:

- **PayPal**: Replace `https://paypal.me/YOUR-BG-DISPUTE-LINK` with your real PayPal link.
- **Venmo**: Replace `@yourvenmohandle` with your Venmo handle.
- Adjust the payment section if you use Stripe, bank transfer, or invoices.

Deployment
----------

This is a static HTML/CSS/JS microsite. You can deploy it as:

- A Netlify / Vercel site with this folder as the publish directory.
- A GitHub Pages site pointed at this folder.
- A subdirectory or subdomain on your primary domain.

If your deployment does not include the parent template files, copy `../style.css` and `../script.js` into this folder so the site is fully self-contained.


