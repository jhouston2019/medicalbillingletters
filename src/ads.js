// AdSense/Native Ads Module
// Cloned from Tax Letter Help & IRS Audit Response
// DO NOT MODIFY BEHAVIOR - Only adjust slot IDs and labels

// ============================================
// STEP 1: GLOBAL ADS CONFIG
// ============================================
const ADS_ENABLED = true;

const AD_CONFIG = {
  provider: 'adsense',
  clientId: 'ca-pub-XXXXXXXXXXXXXXXX', // Replace with actual client ID
  pageExclusions: ['/checkout', '/login', '/dashboard', '/payment', '/upload-hardened', '/admin'],
  maxAdsDesktop: 3,
  maxAdsMobile: 2,
  sessionKey: 'insurance_ads_shown',
  maxAdsPerSession: 5
};

// Medical Bill Dispute Pro Slot IDs
const SLOT_IDS = {
  POST_CONTENT: 'POST_CONTENT_SLOT_ID_INS', // Replace with actual slot ID
  EXIT_GRID: 'EXIT_GRID_SLOT_ID_INS',       // Replace with actual slot ID
  MOBILE_FOOTER: 'MOBILE_FOOTER_SLOT_ID_INS' // Replace with actual slot ID
};

// ============================================
// STEP 2: PAGE EXCLUSION CHECK
// ============================================
function shouldShowAds() {
  if (!ADS_ENABLED) return false;
  
  const currentPath = window.location.pathname;
  
  // Check page exclusions
  for (const excluded of AD_CONFIG.pageExclusions) {
    if (currentPath.includes(excluded)) {
      console.log('[Ads] Page excluded:', currentPath);
      return false;
    }
  }
  
  // Check session cap
  const adsShown = parseInt(sessionStorage.getItem(AD_CONFIG.sessionKey) || '0');
  if (adsShown >= AD_CONFIG.maxAdsPerSession) {
    console.log('[Ads] Session cap reached:', adsShown);
    return false;
  }
  
  return true;
}

// ============================================
// STEP 3: DEVICE DETECTION
// ============================================
function isMobile() {
  return window.innerWidth < 768;
}

// ============================================
// STEP 4: AD INITIALIZATION
// ============================================
function initializeAd(containerId, slotId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn('[Ads] Container not found:', containerId);
    return;
  }
  
  // Create ad ins element
  const adIns = document.createElement('ins');
  adIns.className = 'adsbygoogle';
  adIns.style.display = 'block';
  adIns.setAttribute('data-ad-client', AD_CONFIG.clientId);
  adIns.setAttribute('data-ad-slot', slotId);
  adIns.setAttribute('data-ad-format', 'auto');
  adIns.setAttribute('data-full-width-responsive', 'true');
  
  container.appendChild(adIns);
  
  // Push to AdSense
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    console.log('[Ads] Initialized:', containerId);
    
    // Increment session counter
    const current = parseInt(sessionStorage.getItem(AD_CONFIG.sessionKey) || '0');
    sessionStorage.setItem(AD_CONFIG.sessionKey, (current + 1).toString());
  } catch (error) {
    console.error('[Ads] Failed to initialize:', containerId, error);
  }
}

// ============================================
// STEP 5: LAZY LOAD WITH INTERSECTION OBSERVER
// ============================================
function lazyLoadAd(containerId, slotId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        initializeAd(containerId, slotId);
        observer.unobserve(entry.target);
      }
    });
  }, {
    rootMargin: '200px' // Load 200px before visible
  });
  
  observer.observe(container);
}

// ============================================
// STEP 6: SCROLL-BASED AD LOADING
// ============================================
function initScrollBasedAds() {
  let scrollThreshold = 0.5; // 50% scroll
  let adsLoaded = false;
  
  function checkScroll() {
    if (adsLoaded) return;
    
    const scrollPercent = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
    
    if (scrollPercent >= scrollThreshold) {
      adsLoaded = true;
      loadAds();
    }
  }
  
  window.addEventListener('scroll', checkScroll, { passive: true });
  checkScroll(); // Check immediately
}

// ============================================
// STEP 7: MAIN AD LOADER
// ============================================
function loadAds() {
  if (!shouldShowAds()) return;
  
  const mobile = isMobile();
  const isLandingPage = document.querySelector('.landing-only') !== null;
  
  // Landing page: ONLY ONE AD (post-content)
  if (isLandingPage) {
    console.log('[Ads] Landing page detected - loading single ad only');
    if (document.getElementById('ad-post-content')) {
      lazyLoadAd('ad-post-content', SLOT_IDS.POST_CONTENT);
    }
    return; // Exit early - no other ads on landing page
  }
  
  // Regular SEO pages: Multiple ads based on device
  const maxAds = mobile ? AD_CONFIG.maxAdsMobile : AD_CONFIG.maxAdsDesktop;
  
  console.log('[Ads] Loading ads for device:', mobile ? 'mobile' : 'desktop', 'max:', maxAds);
  
  let adsLoaded = 0;
  
  // Post-content ad (both desktop and mobile)
  if (adsLoaded < maxAds && document.getElementById('ad-post-content')) {
    lazyLoadAd('ad-post-content', SLOT_IDS.POST_CONTENT);
    adsLoaded++;
  }
  
  // Exit grid ad (desktop only)
  if (!mobile && adsLoaded < maxAds && document.getElementById('ad-exit-grid')) {
    lazyLoadAd('ad-exit-grid', SLOT_IDS.EXIT_GRID);
    adsLoaded++;
  }
  
  // Mobile footer sticky (mobile only)
  if (mobile && adsLoaded < maxAds && document.getElementById('ad-mobile-footer')) {
    lazyLoadAd('ad-mobile-footer', SLOT_IDS.MOBILE_FOOTER);
    adsLoaded++;
  }
}

// ============================================
// STEP 8: DISMISS FUNCTIONALITY (MOBILE FOOTER)
// ============================================
function initDismissHandlers() {
  const dismissButtons = document.querySelectorAll('.ad-dismiss');
  dismissButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const adContainer = e.target.closest('.native-ad');
      if (adContainer) {
        adContainer.style.display = 'none';
        console.log('[Ads] Ad dismissed by user');
      }
    });
  });
}

// ============================================
// STEP 9: INITIALIZATION
// ============================================
export function initAds() {
  if (!shouldShowAds()) {
    console.log('[Ads] Ads disabled for this page');
    return;
  }
  
  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initScrollBasedAds();
      initDismissHandlers();
    });
  } else {
    initScrollBasedAds();
    initDismissHandlers();
  }
}

// Auto-initialize if loaded as module
if (typeof window !== 'undefined') {
  initAds();
}
