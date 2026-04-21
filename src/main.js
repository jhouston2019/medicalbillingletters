// Main application entry point
import { getCurrentUser, getSession } from './components/Auth.js';

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
  const pricingBtn = document.getElementById('pricing-checkout');
  if (pricingBtn) {
    pricingBtn.addEventListener('click', (e) => window.startCheckout('single', e));
  }

  // Check if user is logged in
  const user = await getCurrentUser();
  const session = await getSession();
  
  if (user && session) {
    // User is logged in, show dashboard link
    updateNavigationForLoggedInUser(user);
  } else {
    // User is not logged in, show login/signup
    updateNavigationForGuest();
  }
});

function updateNavigationForLoggedInUser(user) {
  const nav = document.querySelector('nav div:last-child');
  if (nav) {
    nav.innerHTML = `
      <a href="/payment.html">Upload</a> |
      <a href="/dashboard.html">Dashboard</a> |
      <a href="/pricing.html">Pricing</a> |
      <span>Welcome, ${user.email}</span> |
      <a href="#" id="logout">Logout</a>
    `;
    
    // Add logout functionality
    document.getElementById('logout').addEventListener('click', async (e) => {
      e.preventDefault();
      const { signOut } = await import('./components/Auth.js');
      await signOut();
      window.location.href = '/';
    });
  }
}

function updateNavigationForGuest() {
  const nav = document.querySelector('nav div:last-child');
  if (nav) {
    nav.innerHTML = `
      <a href="/payment.html">Upload</a> |
      <a href="/dashboard.html">Dashboard</a> |
      <a href="/pricing.html">Pricing</a> |
      <a href="/login.html">Login</a>
    `;
  }
}

// Global checkout function for pricing buttons (requires logged-in user)
window.startCheckout = async function(plan, ev) {
  const clickEv = ev || (typeof globalThis !== 'undefined' && globalThis.event) || null;
  const button = clickEv?.target;
  let originalText = '';
  try {
    const session = await getSession();
    if (!session?.access_token) {
      alert('Please log in to continue to checkout.');
      window.location.href = '/login.html?redirect=' + encodeURIComponent('/pricing');
      return;
    }

    if (button) {
      originalText = button.textContent;
      button.textContent = 'Processing...';
      button.disabled = true;
    }

    const response = await fetch('/.netlify/functions/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ plan: plan || 'single' }),
    });
    
    const data = await response.json();
    
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert('Failed to create checkout session: ' + (data.error || 'Unknown error'));
      if (button) {
        button.textContent = originalText;
        button.disabled = false;
      }
    }
  } catch (error) {
    alert('Failed to start checkout: ' + error.message);
    if (button) {
      button.textContent = button.getAttribute('data-original-text') || 'Try Again';
      button.disabled = false;
    }
  }
};
