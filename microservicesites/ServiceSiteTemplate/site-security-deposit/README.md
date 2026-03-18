Security Deposit Recovery Pro
=============================

This folder contains a focused microsite for tenants who are trying to recover a wrongfully withheld security deposit.

Files
-----

- `index.html` – Landing page explaining the service, how it works, and pricing.
- `intake.html` – Intake form to collect details about the rental, deposit, and dispute.
- `thank-you.html` – Generic confirmation page after the form is submitted.
- `style.css` – Imports the shared styles from the parent template (`../style.css`).
- `script.js` – Uses the shared JavaScript from `../script.js` (smooth scrolling only).

Form Endpoint
-------------

The intake form posts to a placeholder Formspree endpoint:

- `https://formspree.io/f/PLACEHOLDER`

Before going live, replace `PLACEHOLDER` with your real Formspree form ID.

Payment Links
-------------

On `index.html`, update:

- **PayPal**: Replace `https://paypal.me/YOUR-SECURITY-DEPOSIT-LINK` with your real PayPal.me or checkout link.
- **Venmo**: Replace `@yourvenmohandle` with your real Venmo handle.
- Optionally add Stripe / bank transfer / invoice instructions in the payment block.

Deployment
----------

This is a pure static site (HTML/CSS/JS only). You can deploy it as:

- A standalone Netlify or Vercel site (set the publish directory to this folder).
- A GitHub Pages site by pointing Pages at this folder.
- A subdirectory or subdomain on any static host.

If your host does not include the parent `ServiceSiteTemplate` files, copy the shared `style.css` and `script.js` from the root template into this folder so it remains fully self-contained.


