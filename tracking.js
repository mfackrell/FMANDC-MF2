(function() {
  const WEBHOOK_URL = 'https://brickofficeai.app.n8n.cloud/webhook/form-abandonment';
  const SESSION_KEY = 'fmandc_session_id';
  const HISTORY_KEY = 'fmandc_history';
  const ERRORS_KEY = 'fmandc_errors';
  const SNAPSHOT_KEY = 'fmandc_snapshot';
  const FLUSH_DEBOUNCE_MS = 1000;
  
  let lastFlush = 0;

  // 1. Session Management
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
    // Initialize empty stores
    sessionStorage.setItem(HISTORY_KEY, '[]');
    sessionStorage.setItem(ERRORS_KEY, '[]');
    sessionStorage.setItem(SNAPSHOT_KEY, '{}');
  }

  // 2. Log Initial Page Visit
  logPageVisit(window.location.pathname);

  // 3. SPA Navigation Detection (for future React routing)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function() {
    originalPushState.apply(this, arguments);
    logPageVisit(window.location.pathname);
  };
  
  history.replaceState = function() {
    originalReplaceState.apply(this, arguments);
    logPageVisit(window.location.pathname);
  };
  
  // Also detect popstate (back/forward button)
  window.addEventListener('popstate', function() {
    logPageVisit(window.location.pathname);
  });

  function logPageVisit(path) {
    const history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]');
    
    // Calculate time spent on previous page
    if (history.length > 0) {
      const lastVisit = history[history.length - 1];
      const lastTime = new Date(lastVisit.timestamp).getTime();
      const now = Date.now();
      lastVisit.timeSpent = Math.floor((now - lastTime) / 1000);
    }
    
    history.push({
      path: path,
      timestamp: new Date().toISOString(),
      status: 'success'
    });
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  // 4. Error Capture with Blocking Detection
  window.addEventListener('error', function(event) {
    const errors = JSON.parse(sessionStorage.getItem(ERRORS_KEY) || '[]');
    
    // Detect if error is blocking (prevents user from proceeding)
    const message = event.message || '';
    const isBlocking = /network error|failed to fetch|fetch.*failed|api.*failed|cannot read.*undefined|undefined.*not.*object|null is not an object|cannot.*next|cannot proceed|blocked|timeout|cors/i.test(message);
    
    errors.push({
      message: message,
      stack: event.error?.stack || '',
      timestamp: new Date().toISOString(),
      path: window.location.pathname,
      isCritical: isBlocking
    });
    sessionStorage.setItem(ERRORS_KEY, JSON.stringify(errors));
    
    // Mark current page as error in history
    const history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]');
    if (history.length > 0) {
      history[history.length - 1].status = 'error';
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  });

  // 5. Flush on Exit with Debouncing
  function flush() {
    const now = Date.now();
    if (now - lastFlush < FLUSH_DEBOUNCE_MS) {
      console.log('[Website Tracker] Flush debounced');
      return;
    }
    lastFlush = now;

    const payload = {
      sessionId: sessionId,
      siteSection: 'website',
      pageHistory: JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]'),
      errors: JSON.parse(sessionStorage.getItem(ERRORS_KEY) || '[]'),
      userDataSnapshot: JSON.parse(sessionStorage.getItem(SNAPSHOT_KEY) || '{}'),
      userAgent: navigator.userAgent,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      timestamp: new Date().toISOString()
    };

    console.log('[Website Tracker] Flushing:', payload);

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    if (navigator.sendBeacon) {
      const success = navigator.sendBeacon(WEBHOOK_URL, blob);
      console.log('[Website Tracker] Beacon sent:', success);
    } else {
      fetch(WEBHOOK_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        keepalive: true,
        headers: { 'Content-Type': 'application/json' }
      }).catch(e => console.error('[Website Tracker] Flush failed:', e));
    }
  }

  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') flush();
  });
  
  console.log('[Website Tracker] Initialized for session:', sessionId);
})();
