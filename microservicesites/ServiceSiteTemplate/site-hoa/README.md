HOA Letter Response Pro
=======================

This folder contains a microsite for homeowners and condo owners who need help drafting a calm, clear written response to an HOA letter or violation notice.

Files
-----

- `index.html` – Landing page explaining the HOA response service, process, and pricing.
- `intake.html` – Intake form to collect details about the HOA letter and your situation.
- `thank-you.html` – Generic confirmation page after the form is submitted.
- `style.css` – Imports the shared styles from the parent template (`../style.css`).
- `script.js` – Uses the shared JavaScript from `../script.js`.

Form Endpoint
-------------

The intake form posts to a placeholder Formspree endpoint:

- `https://formspree.io/f/PLACEHOLDER`

Update this with your real Formspree form ID before using the site in production.

Payment Links
-------------

On `index.html`, update:

- **PayPal**: Replace `https://paypal.me/YOUR-HOA-RESPONSE-LINK` with your actual PayPal link.
- **Venmo**: Replace `@yourvenmohandle` with your real Venmo handle.
- Adjust or extend the payment section if you use Stripe, Zelle, or invoices.

Deployment
----------

This is a static HTML/CSS/JS site. You can deploy it as:

- A Netlify / Vercel site using this folder as the publish directory.
- A GitHub Pages site pointed at this folder.
- A subdirectory or subdomain of your main website.

If your hosting setup does not include the parent template files, copy `../style.css` and `../script.js` into this folder so the microsite is fully self-contained.


