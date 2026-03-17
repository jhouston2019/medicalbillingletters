# Admin System Guide
**Secure Dashboard for Site Management & Quality Monitoring**

---

## Overview

The admin system provides secure, comprehensive access to:
- Real-time quality metrics
- Document management
- Outcome tracking
- System logs
- A/B test experiments
- Prompt performance
- Site navigation for testing

---

## Quick Start

### 1. Initial Setup (One-Time)

**Step 1: Run Database Migration**

```bash
psql "postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres"
\i supabase/migrations/20260317_admin_system.sql
```

**Step 2: Set Environment Variable**

Add to Netlify environment variables:

```bash
ADMIN_SETUP_KEY=your-secret-setup-key-here-min-32-chars
```

**Step 3: Create Admin User**

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/admin-setup-password \
  -H "Content-Type: application/json" \
  -d '{
    "setupKey": "your-secret-setup-key-here-min-32-chars",
    "email": "admin@yourdomain.com",
    "password": "YourSecurePassword123!",
    "fullName": "Your Name"
  }'
```

**Password Requirements:**
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols recommended
- Store securely (password manager)

**Step 4: Disable Setup Function**

After creating your admin user, remove `ADMIN_SETUP_KEY` from environment variables to prevent unauthorized admin creation.

---

## Accessing the Admin Dashboard

### Login Flow

1. **Find Admin Link**
   - Look in the footer of any page
   - Small gray "Admin" link (subtle, not prominent)
   - Or navigate directly to: `https://your-site.com/admin-login.html`

2. **Login Screen**
   - Enter admin email
   - Enter password
   - Click "Sign In"
   - Session valid for 24 hours

3. **Dashboard Access**
   - Automatic redirect to `/admin-dashboard.html`
   - Full access to all metrics and data
   - Auto-refresh every 30 seconds

---

## Dashboard Features

### 📊 Overview Tab

**Real-Time Statistics:**
- Total users (7-day, 30-day growth)
- Total documents uploaded
- Letters generated
- Total revenue ($19 per letter)
- Average quality score (7-day)
- Citation accuracy (7-day)
- Success rate
- System errors (24-hour)

**Recent Activity Table:**
- Last 20 documents
- User email
- Claim type
- Status
- Quality score
- Citation accuracy
- Outcome result

### 📄 Documents Tab

**All Documents (Last 100):**
- Document ID
- Created date
- User email
- Claim type
- Phase (initial, appeal, escalation)
- Payment status
- Letter generated (yes/no)
- Current status

**Use Cases:**
- Track document flow
- Identify stuck documents
- Monitor payment completion
- Verify letter generation

### ✅ Quality Metrics Tab

**Summary Statistics:**
- Average overall score
- Average generic language score
- Average specificity score
- Average professionalism score

**Quality Assessments Table:**
- All quality assessments
- Overall score (0-100)
- Quality grade (A+ to F)
- Component scores
- Ready to send flag

**Use Cases:**
- Monitor quality trends
- Identify low-quality outputs
- Validate quality gates working
- Track improvement over time

### 🎯 Outcomes Tab

**Summary Statistics:**
- Total outcomes tracked
- Success rate (%)
- Average recovery percentage
- Average days to resolution

**Outcome Tracking Table:**
- Document ID
- Status (pending, sent, response, resolved)
- Result (success, partial, failure)
- Recovery percentage
- Days to response
- Days to resolution
- User satisfaction (1-5 stars)

**Use Cases:**
- Measure real-world success
- Correlate quality with outcomes
- Track resolution times
- Monitor user satisfaction

### 📋 System Logs Tab

**Log Entries (Last 100):**
- Timestamp
- Log level (debug, info, warn, error, critical)
- Event type (30+ types)
- Message
- Duration (ms)
- Cost ($)
- User ID

**Use Cases:**
- Debug errors
- Monitor performance
- Track API costs
- Identify bottlenecks
- System health checks

### 🧪 A/B Tests Tab

**Experiments:**
- Experiment name
- Status (draft, running, paused, completed)
- Control variant
- Test variant
- Traffic percentage
- Start/end dates
- Winner determination

**Use Cases:**
- Monitor active experiments
- Review experiment results
- Determine winners
- Plan new experiments

### 💬 Prompts Tab

**Prompt Versions:**
- Prompt name
- Version number
- Active status
- Usage count
- Average quality score
- Average citation score
- Success rate
- Created date

**Use Cases:**
- Track prompt performance
- Compare versions
- Identify best performers
- Plan optimizations

### 🌐 Site Pages Tab

**Quick Navigation:**
- All site pages organized by category
- One-click access to any page
- Opens in new tab for testing
- Includes all letter type pages

**Categories:**
- Core pages (home, payment, upload)
- User pages (dashboard, login, signup)
- Legal pages (privacy, terms, disclaimer)
- Letter type pages (denied, delay, underpaid, etc.)

**Use Cases:**
- Quick site testing
- Page verification
- Content review
- Flow testing

---

## Security Features

### Authentication

**Session Management:**
- 24-hour session expiration
- Secure token generation (32-byte random)
- Automatic session cleanup
- IP address tracking
- User agent logging

**Password Security:**
- bcrypt hashing (cost factor 10)
- Minimum 12 characters required
- No password storage in plain text
- Secure comparison

### Authorization

**Role-Based Access:**
- `super_admin` - Full access
- `admin` - Standard access
- `viewer` - Read-only access

**Row Level Security (RLS):**
- All admin tables protected
- Service role only access
- No direct database access from frontend

### Activity Logging

**All Actions Logged:**
- Login attempts (success/failure)
- Logout
- Dashboard views
- Data access (documents, quality, outcomes, logs)
- Experiment views
- Prompt views

**Log Details:**
- Admin user ID
- Action type
- Resource accessed
- IP address
- Timestamp

---

## Monitoring & Maintenance

### Daily Checks

**Health Indicators:**
1. System errors (24h) - Should be near 0
2. Average quality score - Should be 85%+
3. Citation accuracy - Should be 95%+
4. Success rate - Should be 85%+ (after sufficient data)

**Actions if Issues:**
- Errors high → Check system logs tab
- Quality low → Review quality metrics tab
- Citations low → Check citation verification
- Success low → Analyze outcomes tab

### Weekly Reviews

**Quality Trends:**
- Review quality metrics over 7 days
- Identify patterns in low scores
- Check for generic language increases
- Monitor specificity scores

**Outcome Analysis:**
- Calculate weekly success rate
- Review resolution times
- Check user satisfaction
- Correlate quality with outcomes

**Cost Monitoring:**
- Review OpenAI API costs in logs
- Calculate cost per letter
- Identify expensive operations
- Optimize if needed

### Monthly Tasks

**Prompt Optimization:**
- Review prompt performance
- Compare versions
- Identify underperformers
- Generate optimizations

**A/B Test Review:**
- Complete experiments
- Determine winners
- Deploy winning variants
- Plan new experiments

**System Health:**
- Review error patterns
- Check performance metrics
- Validate quality targets
- Update documentation

---

## Common Admin Tasks

### View Recent Documents

1. Navigate to Documents tab
2. Review last 100 documents
3. Check payment status
4. Verify letter generation

### Check Quality Scores

1. Navigate to Quality Metrics tab
2. Review average scores
3. Identify low-scoring documents
4. Check component breakdowns

### Monitor System Health

1. Navigate to Overview tab
2. Check error count (24h)
3. Review recent activity
4. Verify all metrics green

### Review Experiment Results

1. Navigate to A/B Tests tab
2. Find completed experiments
3. Review winner determination
4. Check statistical significance

### Track Outcomes

1. Navigate to Outcomes tab
2. Review success rate
3. Check resolution times
4. Monitor user satisfaction

### Debug Errors

1. Navigate to System Logs tab
2. Filter by log level (error, critical)
3. Review error messages
4. Check stack traces
5. Identify patterns

---

## Troubleshooting

### Cannot Login

**Issue:** "Invalid credentials" error

**Solutions:**
1. Verify email is correct (case-insensitive)
2. Verify password is correct
3. Check if user is active in database
4. Review admin_activity_log for failed attempts

**SQL Check:**
```sql
SELECT email, is_active, last_login_at 
FROM admin_users 
WHERE email = 'your-email@example.com';
```

### Session Expired

**Issue:** Redirected to login after being logged in

**Solutions:**
1. Sessions expire after 24 hours
2. Simply log in again
3. Session tokens stored in localStorage

**Note:** This is expected behavior for security

### No Data Showing

**Issue:** Dashboard shows "No data" or loading spinners

**Solutions:**
1. Verify database migration ran successfully
2. Check if quality systems are deployed
3. Verify Netlify functions are live
4. Check browser console for errors

**SQL Check:**
```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('quality_metrics', 'outcome_tracking', 'structured_logs');

-- Check if data exists
SELECT COUNT(*) FROM quality_metrics;
SELECT COUNT(*) FROM outcome_tracking;
SELECT COUNT(*) FROM structured_logs;
```

### Stats Not Updating

**Issue:** Dashboard stats seem stale

**Solutions:**
1. Click refresh button on each tab
2. Auto-refresh runs every 30 seconds
3. Check if views are created correctly

**SQL Check:**
```sql
-- Verify views exist
SELECT viewname FROM pg_views 
WHERE schemaname = 'public' 
AND viewname IN ('admin_dashboard_stats', 'admin_recent_activity');

-- Test views
SELECT * FROM admin_dashboard_stats;
SELECT * FROM admin_recent_activity LIMIT 5;
```

### Unauthorized Errors

**Issue:** API calls return 401 Unauthorized

**Solutions:**
1. Session may have expired - log in again
2. Check if session token is in localStorage
3. Verify admin_sessions table has active session

**Browser Console:**
```javascript
// Check session token
console.log(localStorage.getItem('admin_session_token'));

// Check user data
console.log(localStorage.getItem('admin_user'));
```

---

## API Reference

### Admin Endpoints

All endpoints require `Authorization: Bearer <session_token>` header.

#### POST /admin-login
Authenticate admin user and create session.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "sessionToken": "abc123...",
  "expiresAt": "2026-03-18T14:00:00Z",
  "user": {
    "email": "admin@example.com",
    "fullName": "Admin Name",
    "role": "super_admin"
  }
}
```

#### GET /admin-verify-session
Verify if session token is valid.

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "fullName": "Admin Name",
    "role": "super_admin"
  }
}
```

#### POST /admin-logout
Invalidate session token.

**Response:**
```json
{
  "success": true
}
```

#### GET /admin-dashboard-stats
Get dashboard statistics and recent activity.

**Response:**
```json
{
  "stats": {
    "total_users": 150,
    "new_users_7d": 12,
    "total_documents": 320,
    "letters_generated": 285,
    "total_revenue": 5415,
    "avg_quality_7d": 88.5,
    "avg_citation_accuracy_7d": 96.2,
    "successful_outcomes": 45,
    "total_outcomes": 52,
    "errors_24h": 2
  },
  "recentActivity": [...]
}
```

#### GET /admin-documents
Get all documents (last 100).

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "created_at": "2026-03-17T10:00:00Z",
      "user_email": "user@example.com",
      "claim_type": "property_homeowners",
      "phase": "initial",
      "payment_status": "completed",
      "letter_generated": true,
      "status": "completed"
    }
  ]
}
```

#### GET /admin-quality-metrics
Get quality assessments (last 100).

**Response:**
```json
{
  "metrics": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "overall_score": 88.5,
      "quality_grade": "B",
      "generic_language_score": 92.0,
      "specificity_score": 85.0,
      "professionalism_score": 90.0,
      "structure_score": 87.5,
      "ready_to_send": true,
      "created_at": "2026-03-17T10:00:00Z"
    }
  ]
}
```

#### GET /admin-outcomes
Get outcome tracking data (last 100).

**Response:**
```json
{
  "outcomes": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "outcome_status": "resolved",
      "outcome_result": "success",
      "recovery_percentage": 95.0,
      "days_to_response": 14,
      "days_to_resolution": 28,
      "user_satisfaction": 5,
      "created_at": "2026-03-17T10:00:00Z"
    }
  ]
}
```

#### GET /admin-logs
Get system logs (last 100).

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "log_level": "info",
      "event_type": "letter_generated",
      "message": "Letter generated successfully",
      "duration_ms": 3450,
      "cost_usd": 0.0234,
      "user_id": "uuid",
      "created_at": "2026-03-17T10:00:00Z"
    }
  ]
}
```

#### GET /admin-experiments
Get A/B test experiments.

**Response:**
```json
{
  "experiments": [
    {
      "id": "uuid",
      "experiment_name": "temperature_test",
      "status": "completed",
      "control_variant": "temp_0.2",
      "test_variant": "temp_0.3",
      "traffic_percentage": 50,
      "winner_variant": "temp_0.3",
      "started_at": "2026-03-01T00:00:00Z",
      "completed_at": "2026-03-15T00:00:00Z"
    }
  ]
}
```

#### GET /admin-prompts
Get prompt versions and performance.

**Response:**
```json
{
  "prompts": [
    {
      "id": "uuid",
      "prompt_name": "system_generation_v2",
      "version": 2,
      "is_active": true,
      "usage_count": 145,
      "avg_quality_score": 88.5,
      "avg_citation_score": 96.2,
      "success_rate": 87.3,
      "created_at": "2026-03-01T00:00:00Z"
    }
  ]
}
```

---

## Database Schema

### admin_users

```sql
CREATE TABLE admin_users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text,
  role text DEFAULT 'admin',
  is_active boolean DEFAULT true,
  last_login_at timestamp,
  login_count integer DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
```

**Roles:**
- `super_admin` - Full access, can create other admins
- `admin` - Standard access, can view and manage
- `viewer` - Read-only access

### admin_sessions

```sql
CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY,
  admin_user_id uuid REFERENCES admin_users(id),
  session_token text UNIQUE NOT NULL,
  ip_address text,
  user_agent text,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now()
);
```

**Session Lifecycle:**
1. Created on login
2. Validated on each request
3. Expired after 24 hours
4. Deleted on logout or expiration

### admin_activity_log

```sql
CREATE TABLE admin_activity_log (
  id uuid PRIMARY KEY,
  admin_user_id uuid REFERENCES admin_users(id),
  action text NOT NULL,
  resource_type text,
  resource_id text,
  details jsonb,
  ip_address text,
  created_at timestamp DEFAULT now()
);
```

**Logged Actions:**
- `login_success`, `login_failed`
- `logout`
- `view_dashboard`, `view_documents`, `view_quality_metrics`
- `view_outcomes`, `view_logs`, `view_experiments`, `view_prompts`
- `admin_created`

---

## Security Best Practices

### Password Management

**Requirements:**
- Minimum 12 characters
- Change default password immediately
- Use password manager
- Never share credentials
- Rotate passwords quarterly

**Recommended Format:**
- Mix uppercase, lowercase, numbers, symbols
- Example: `Cl@imHelp2026!Secure`

### Session Management

**Best Practices:**
- Log out when done
- Don't share session tokens
- Clear browser cache on shared computers
- Monitor last_login_at for suspicious activity

### Access Control

**Principle of Least Privilege:**
- Use `viewer` role for read-only access
- Reserve `super_admin` for primary administrator
- Create separate accounts for team members
- Deactivate unused accounts

### Monitoring

**Regular Checks:**
- Review admin_activity_log weekly
- Check for failed login attempts
- Monitor unusual access patterns
- Verify IP addresses are expected

**SQL Queries:**
```sql
-- Failed login attempts (last 7 days)
SELECT created_at, details->>'email' as email, ip_address
FROM admin_activity_log
WHERE action = 'login_failed'
AND created_at > now() - interval '7 days'
ORDER BY created_at DESC;

-- All admin logins (last 30 days)
SELECT au.email, au.full_name, aal.created_at, aal.ip_address
FROM admin_activity_log aal
JOIN admin_users au ON aal.admin_user_id = au.id
WHERE aal.action = 'login_success'
AND aal.created_at > now() - interval '30 days'
ORDER BY aal.created_at DESC;

-- Active sessions
SELECT au.email, s.created_at, s.expires_at, s.ip_address
FROM admin_sessions s
JOIN admin_users au ON s.admin_user_id = au.id
WHERE s.expires_at > now()
ORDER BY s.created_at DESC;
```

---

## Advanced Features

### Creating Additional Admin Users

**Option 1: Via Setup Function (if enabled)**

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/admin-setup-password \
  -H "Content-Type: application/json" \
  -d '{
    "setupKey": "your-setup-key",
    "email": "newadmin@example.com",
    "password": "SecurePassword123!",
    "fullName": "New Admin Name"
  }'
```

**Option 2: Via SQL (recommended for production)**

```sql
-- Generate password hash using bcrypt (cost 10)
-- Use online bcrypt generator or Node.js script

INSERT INTO admin_users (email, password_hash, full_name, role, is_active)
VALUES (
  'newadmin@example.com',
  '$2b$10$...your-bcrypt-hash...',
  'New Admin Name',
  'admin',
  true
);
```

### Deactivating Admin Users

```sql
UPDATE admin_users 
SET is_active = false 
WHERE email = 'admin@example.com';
```

### Cleaning Up Old Sessions

```sql
-- Delete expired sessions
DELETE FROM admin_sessions 
WHERE expires_at < now();

-- Delete sessions older than 30 days
DELETE FROM admin_sessions 
WHERE created_at < now() - interval '30 days';
```

### Exporting Activity Logs

```sql
-- Export last 30 days of activity
COPY (
  SELECT 
    au.email,
    aal.action,
    aal.resource_type,
    aal.ip_address,
    aal.created_at
  FROM admin_activity_log aal
  LEFT JOIN admin_users au ON aal.admin_user_id = au.id
  WHERE aal.created_at > now() - interval '30 days'
  ORDER BY aal.created_at DESC
) TO '/tmp/admin_activity_export.csv' CSV HEADER;
```

---

## Integration with Quality Systems

### Viewing Quality Data

The admin dashboard integrates with all quality systems:

**Citation Verification:**
- View accuracy rates
- Check verified citations
- Monitor hallucination detection

**Quality Assurance:**
- Review component scores
- Track quality grades
- Monitor quality gates

**Outcome Tracking:**
- Measure success rates
- Track resolution times
- Monitor user satisfaction

**Structured Logging:**
- View all system events
- Monitor performance
- Track costs

### Quality Alerts

**Recommended Thresholds:**
- Quality score < 85% → Review prompt
- Citation accuracy < 95% → Check verification
- Success rate < 85% → Analyze outcomes
- Errors > 10/day → Investigate logs

---

## Deployment Checklist

### Pre-Deployment

- [ ] Run admin system migration
- [ ] Set ADMIN_SETUP_KEY environment variable
- [ ] Deploy all admin functions to Netlify
- [ ] Verify bcryptjs is installed (`npm install`)

### Initial Setup

- [ ] Create first admin user via setup function
- [ ] Test login with credentials
- [ ] Verify dashboard loads
- [ ] Check all tabs display data
- [ ] Remove ADMIN_SETUP_KEY from environment

### Post-Deployment

- [ ] Change default admin password
- [ ] Test all dashboard features
- [ ] Verify session expiration works
- [ ] Check activity logging
- [ ] Document admin credentials securely

### Ongoing

- [ ] Monitor admin_activity_log weekly
- [ ] Review quality metrics daily
- [ ] Check system health daily
- [ ] Rotate passwords quarterly
- [ ] Update documentation as needed

---

## Support

### Documentation

- **This Guide:** Admin system setup and usage
- **DEPLOYMENT_GUIDE.md:** Full deployment instructions
- **MONITORING_GUIDE.md:** System monitoring
- **TROUBLESHOOTING_GUIDE.md:** Common issues

### Database Queries

See SQL examples throughout this guide for:
- User management
- Session management
- Activity monitoring
- Data verification

### Contact

For admin system issues:
1. Check this guide first
2. Review admin_activity_log
3. Check system logs
4. Verify database migration

---

## Roadmap

### Completed ✅

- [x] Secure authentication
- [x] Session management
- [x] Activity logging
- [x] Dashboard statistics
- [x] Quality metrics view
- [x] Outcome tracking view
- [x] System logs view
- [x] A/B tests view
- [x] Prompts view
- [x] Site navigation

### Future Enhancements

- [ ] Real-time dashboard updates (WebSocket)
- [ ] Advanced filtering and search
- [ ] Data export (CSV, JSON)
- [ ] Custom date ranges
- [ ] Email alerts for critical errors
- [ ] Two-factor authentication (2FA)
- [ ] Audit report generation
- [ ] User management UI
- [ ] Role permission customization

---

**Version:** 1.0  
**Last Updated:** March 17, 2026  
**Status:** ✅ Production Ready
