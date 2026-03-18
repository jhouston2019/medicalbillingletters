import { getStore } from '@netlify/blobs';
import sgMail from '@sendgrid/mail';
import * as Sentry from '@sentry/serverless';

// Initialize Sentry
Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production'
});

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Email templates
const templates = {
  welcome: {
    subject: '🚗 Welcome to AutoClaimNavigatorAI',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 Welcome to AutoClaimNavigatorAI!</h1>
          </div>
          <div class="content">
            <h2>Hi ${data.name || 'there'},</h2>
            <p>Thank you for joining AutoClaimNavigatorAI! You're now equipped with AI-powered tools to fight for fair auto insurance settlements.</p>
            <p><strong>Your account includes:</strong></p>
            <ul>
              <li>20 AI-powered claim responses</li>
              <li>Total loss valuation disputes</li>
              <li>Diminished value calculations</li>
              <li>Repair supplement documentation</li>
              <li>Access to state-specific regulations</li>
            </ul>
            <p>Average recoveries: $3,000-8,000 for total loss, $2,000-15,000 for diminished value</p>
            <a href="${process.env.URL}/success" class="button">Access Your Dashboard</a>
            <p style="margin-top: 30px;"><strong>Need help?</strong> Reply to this email for support.</p>
          </div>
          <div class="footer">
            <p>AutoClaimNavigatorAI | Fighting for Fair Settlements</p>
            <p>This email was sent to ${data.email}</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  creditLow: {
    subject: '⚠️ Low Credits - AutoClaimNavigatorAI',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .alert { background: #fef2f2; border: 1px solid #fecaca; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
          .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="alert">
            <h2>⚠️ You have only ${data.credits} credits remaining</h2>
          </div>
          <div class="content">
            <p>Hi ${data.name || 'there'},</p>
            <p>Your AutoClaimNavigatorAI account is running low on AI generation credits.</p>
            <p>Don't let your claim stall! Purchase additional credits to continue fighting for your fair settlement.</p>
            <p><strong>Remember:</strong> Each AI response can help you recover thousands in undervalued claims.</p>
            <a href="${process.env.URL}/purchase" class="button">Purchase More Credits</a>
          </div>
        </div>
      </body>
      </html>
    `
  },
  claimSuccess: {
    subject: '✅ Claim Document Generated',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .success { background: #d1fae5; border: 1px solid #a7f3d0; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
          .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 10px; }
          .details { background: #f9fafb; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">
            <h2>✅ Your claim document is ready!</h2>
          </div>
          <div class="content">
            <p>Hi ${data.name || 'there'},</p>
            <p>Your ${data.claimType} document has been successfully generated.</p>
            <div class="details">
              <strong>Details:</strong><br>
              Vehicle: ${data.vehicle}<br>
              Claim Type: ${data.claimType}<br>
              Generated: ${new Date().toLocaleString()}<br>
              Credits Remaining: ${data.creditsRemaining}
            </div>
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Review the generated document carefully</li>
              <li>Add any additional supporting evidence</li>
              <li>Submit to your insurance company within deadlines</li>
              <li>Document all responses for your records</li>
            </ol>
            <p><strong>Pro Tip:</strong> Most insurance companies have 30-60 day response requirements. Mark your calendar!</p>
          </div>
        </div>
      </body>
      </html>
    `
  }
};

// Queue email for sending
export async function queueEmail(type, to, data, priority = 'normal') {
  const store = getStore({
    name: 'email-queue',
    siteID: process.env.SITE_ID,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  
  const emailJob = {
    id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    to,
    data,
    priority,
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
    scheduledFor: new Date().toISOString()
  };
  
  await store.setJSON(emailJob.id, emailJob);
  
  return emailJob.id;
}

// Process email queue
async function processQueue() {
  const store = getStore({
    name: 'email-queue',
    siteID: process.env.SITE_ID,
    token: process.env.BLOB_READ_WRITE_TOKEN
  });
  
  const { blobs } = await store.list();
  const now = new Date();
  
  // Sort by priority and creation time
  const jobs = [];
  for (const blob of blobs) {
    const job = JSON.parse(await (await store.get(blob.key)).text());
    if (job.status === 'pending' && new Date(job.scheduledFor) <= now) {
      jobs.push(job);
    }
  }
  
  jobs.sort((a, b) => {
    if (a.priority === 'high' && b.priority !== 'high') return -1;
    if (b.priority === 'high' && a.priority !== 'high') return 1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  
  // Process up to 10 emails per run
  const toProcess = jobs.slice(0, 10);
  
  for (const job of toProcess) {
    try {
      // Get template
      const template = templates[job.type];
      if (!template) {
        throw new Error(`Unknown email template: ${job.type}`);
      }
      
      // Send email
      const msg = {
        to: job.to,
        from: {
          email: process.env.SENDER_EMAIL || 'support@autoclaimnavigatorai.com',
          name: 'AutoClaimNavigatorAI'
        },
        subject: template.subject,
        html: template.html(job.data),
        trackingSettings: {
          clickTracking: { enable: false },
          openTracking: { enable: false }
        }
      };
      
      await sgMail.send(msg);
      
      // Mark as sent
      job.status = 'sent';
      job.sentAt = new Date().toISOString();
      await store.setJSON(job.id, job);
      
      console.log(`Email sent: ${job.type} to ${job.to}`);
      
    } catch (error) {
      // Handle failure
      job.attempts++;
      job.lastError = error.message;
      
      if (job.attempts >= 3) {
        job.status = 'failed';
        job.failedAt = new Date().toISOString();
      } else {
        // Retry with exponential backoff
        job.scheduledFor = new Date(Date.now() + Math.pow(2, job.attempts) * 60000).toISOString();
      }
      
      await store.setJSON(job.id, job);
      
      // Log to Sentry
      Sentry.captureException(error, {
        tags: {
          emailType: job.type,
          attempts: job.attempts
        }
      });
    }
  }
  
  // Clean up old sent emails (older than 7 days)
  for (const blob of blobs) {
    const job = JSON.parse(await (await store.get(blob.key)).text());
    if (job.status === 'sent' && 
        new Date(job.sentAt) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
      await store.delete(blob.key);
    }
  }
}

exports.handler = Sentry.AWSLambda.wrapHandler(async (event, context) => {
  try {
    // This function runs on a schedule (every 5 minutes)
    await processQueue();
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
    
  } catch (error) {
    Sentry.captureException(error);
    console.error('Email queue error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Email queue processing failed' })
    };
  }
});