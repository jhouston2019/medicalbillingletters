# Admin System Setup - Quick Start
**Get your admin dashboard running in 5 minutes**

---

## Prerequisites

✅ Database migration completed (`20260317_citation_and_quality_systems.sql`)  
✅ Netlify functions deployed  
✅ bcryptjs installed (`npm install`)

---

## Step-by-Step Setup

### Step 1: Run Admin Migration (2 minutes)

```bash
# Connect to your Supabase database
psql "postgresql://postgres:[YOUR_PASSWORD]@[YOUR_PROJECT].supabase.co:5432/postgres"

# Run the migration
\i supabase/migrations/20260317_admin_system.sql

# Verify tables created
\dt admin_*

# Exit
\q
```

**Expected Output:**
```
✅ ADMIN SYSTEM MIGRATION COMPLETE
Tables: admin_users, admin_sessions, admin_activity_log created
Views: admin_dashboard_stats, admin_recent_activity created
```

---

### Step 2: Set Environment Variable (1 minute)

**In Netlify Dashboard:**

1. Go to: Site settings → Environment variables
2. Add new variable:
   - **Key:** `ADMIN_SETUP_KEY`
   - **Value:** `your-secret-key-min-32-characters-long-random-string`
   - **Scopes:** All (Production, Deploy Previews, Branch deploys)
3. Click "Save"
4. Trigger redeploy (Deploys → Trigger deploy → Deploy site)

---

### Step 3: Create Your Admin User (1 minute)

**Option A: Using curl (Recommended)**

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/admin-setup-password \
  -H "Content-Type: application/json" \
  -d '{
    "setupKey": "your-secret-key-min-32-characters-long-random-string",
    "email": "your-email@example.com",
    "password": "YourSecurePassword123!",
    "fullName": "Your Full Name"
  }'
```

**Option B: Using Postman/Insomnia**

- Method: POST
- URL: `https://your-site.netlify.app/.netlify/functions/admin-setup-password`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "setupKey": "your-secret-key-min-32-characters-long-random-string",
  "email": "your-email@example.com",
  "password": "YourSecurePassword123!",
  "fullName": "Your Full Name"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Admin user created successfully",
  "email": "your-email@example.com"
}
```

---

### Step 4: Secure the System (1 minute)

**Remove Setup Key:**

1. Go to Netlify: Site settings → Environment variables
2. Find `ADMIN_SETUP_KEY`
3. Click "Delete"
4. Confirm deletion
5. Trigger redeploy

**Why:** This prevents anyone from creating additional admin users without database access.

---

### Step 5: Test Login (30 seconds)

1. Navigate to: `https://your-site.com/admin-login.html`
   - Or click "Admin" link in footer (subtle, gray text)

2. Enter credentials:
   - Email: `your-email@example.com`
   - Password: `YourSecurePassword123!`

3. Click "Sign In"

4. You should be redirected to: `/admin-dashboard.html`

5. Verify you can see:
   - Overview statistics
   - Recent activity
   - All navigation tabs

---

## What You Get

### Dashboard Tabs

1. **📊 Overview** - Real-time stats, recent activity
2. **📄 Documents** - All uploaded documents
3. **✅ Quality Metrics** - Quality scores and grades
4. **🎯 Outcomes** - Success rates and resolution tracking
5. **📋 System Logs** - All system events and errors
6. **🧪 A/B Tests** - Experiment results
7. **💬 Prompts** - Prompt performance
8. **🌐 Site Pages** - Quick navigation to all pages

### Key Features

✅ **Real-time monitoring** - Auto-refresh every 30 seconds  
✅ **Secure sessions** - 24-hour expiration  
✅ **Activity logging** - All actions tracked  
✅ **Quality insights** - See what's working  
✅ **Outcome tracking** - Measure real success  
✅ **Cost monitoring** - Track OpenAI spend  
✅ **Site testing** - One-click page access  

---

## Quick Reference

### Login URL
```
https://your-site.com/admin-login.html
```

### Default Credentials
```
Email: admin@insuranceclaimletterhelp.ai
Password: [Set during Step 3]
```

### Session Duration
```
24 hours (auto-logout after expiration)
```

### Access from Footer
```
Look for small gray "Admin" link in footer
```

---

## Troubleshooting

### "Invalid credentials" error

**Check:**
1. Email is correct (case-insensitive)
2. Password is correct (case-sensitive)
3. User is active in database

**SQL Fix:**
```sql
SELECT email, is_active FROM admin_users;
UPDATE admin_users SET is_active = true WHERE email = 'your-email@example.com';
```

### "Unauthorized" error in dashboard

**Check:**
1. Session may have expired (24 hours)
2. Clear localStorage and log in again

**Browser Console:**
```javascript
localStorage.clear();
window.location.reload();
```

### Dashboard shows no data

**Check:**
1. Quality systems migration ran successfully
2. Letters have been generated
3. Tables exist in database

**SQL Verify:**
```sql
SELECT COUNT(*) FROM quality_metrics;
SELECT COUNT(*) FROM outcome_tracking;
SELECT COUNT(*) FROM claim_letters WHERE letter_generated = true;
```

### Cannot create admin user

**Check:**
1. ADMIN_SETUP_KEY is set in Netlify
2. Setup key matches in request
3. Email doesn't already exist
4. Password meets requirements (12+ chars)

---

## Next Steps

After setup:

1. **Test Dashboard**
   - Click through all tabs
   - Verify data displays
   - Test refresh buttons

2. **Generate Test Letter**
   - Go through normal user flow
   - Check if it appears in dashboard
   - Verify quality metrics recorded

3. **Monitor Daily**
   - Check overview stats
   - Review error count
   - Monitor quality scores

4. **Secure Credentials**
   - Store password in password manager
   - Document admin email
   - Share with authorized team only

---

## Support

**Documentation:**
- ADMIN_SYSTEM_GUIDE.md (comprehensive guide)
- DEPLOYMENT_GUIDE.md (full deployment)
- MONITORING_GUIDE.md (monitoring strategies)

**Database:**
- All admin tables have RLS enabled
- Service role only access
- Activity logging for audit trail

**Security:**
- bcrypt password hashing
- Secure session tokens
- IP address tracking
- Automatic session expiration

---

**Setup Time:** ~5 minutes  
**Status:** ✅ Ready to Deploy  
**Security:** 🔒 Enterprise-grade
