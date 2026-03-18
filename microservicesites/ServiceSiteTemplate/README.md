ServiceSiteTemplate
====================

This repository is a **template for small service microsites**. It provides a simple, responsive HTML/CSS layout with:

- `index.html` – landing page with hero, benefits, process, pricing, FAQ, and calls to action.
- `intake.html` – intake form page that posts to a Formspree endpoint (placeholder by default).
- `thank-you.html` – generic confirmation page after form submission.
- `style.css` – shared minimal styling for all pages.
- `script.js` – optional JavaScript for basic UI behavior (e.g., smooth scrolling).

You can duplicate this template into separate folders for each niche service, then customize the copy.

## Files

- `index.html` – Generic layout with placeholder content.
- `intake.html` – Generic intake form fields you can adapt to a specific use case.
- `thank-you.html` – Generic success page with next steps.
- `style.css` – Shared typography, layout, section, and form styles.
- `script.js` – Hooks for smooth scrolling and potential minor enhancements.

## How to Use

1. **Duplicate the folder** and rename it for your niche, for example:
   - `site-security-deposit/`
   - `site-contractor-estimate/`
2. **Edit the text** in `index.html`, `intake.html`, and `thank-you.html` to match the service.
3. **Update the Formspree endpoint** in `intake.html`:
   - Replace `https://formspree.io/f/PLACEHOLDER` with your real Formspree form URL.
4. **Connect payments**:
   - Replace placeholder PayPal and Venmo values in the pricing/payment section.
5. Deploy each folder as its own static site (GitHub Pages, Netlify, Vercel, etc.).

## Deployment (General)

Because these are pure static sites (HTML/CSS/JS only), you can:

- Serve them from any static web host.
- Deploy each folder as a separate site or as subpaths/subdomains.
- Use GitHub Pages by pointing the Pages configuration at the relevant folder.


