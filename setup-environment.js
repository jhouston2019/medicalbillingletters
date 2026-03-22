#!/usr/bin/env node

/**
 * Medical Bill Dispute Pro Environment Setup Script
 * This script helps you set up all required environment variables and configurations
 */

import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

console.log('🚀 Medical Bill Dispute Pro Environment Setup');
console.log('=====================================\n');

async function setupEnvironment() {
  const envVars = {};
  
  console.log('📋 Setting up environment variables...\n');
  
  // Supabase Configuration
  console.log('🔧 Supabase Configuration:');
  envVars.VITE_SUPABASE_URL = await question('Enter your Supabase project URL: ');
  envVars.VITE_SUPABASE_ANON_KEY = await question('Enter your Supabase anon key: ');
  envVars.SUPABASE_URL = envVars.VITE_SUPABASE_URL;
  envVars.SUPABASE_SERVICE_ROLE_KEY = await question('Enter your Supabase service role key: ');
  
  console.log('\n🤖 OpenAI Configuration:');
  envVars.OPENAI_API_KEY = await question('Enter your OpenAI API key: ');
  
  console.log('\n💳 Stripe Configuration:');
  envVars.STRIPE_SECRET_KEY = await question('Enter your Stripe secret key (sk_live_...): ');
  envVars.STRIPE_PUBLIC_KEY = await question('Enter your Stripe public key (pk_live_...): ');
  envVars.STRIPE_WEBHOOK_SECRET = await question('Enter your Stripe webhook secret (whsec_...): ');
  
  console.log('\n💰 Stripe Price IDs:');
  envVars.STRIPE_PRICE_STANDARD = await question('Enter Standard plan price ID (price_...): ');
  envVars.STRIPE_PRICE_COMPLEX = await question('Enter Complex plan price ID (price_...): ');
  envVars.STRIPE_PRICE_STARTER = await question('Enter Starter plan price ID (price_...): ');
  envVars.STRIPE_PRICE_PRO = await question('Enter Pro plan price ID (price_...): ');
  envVars.STRIPE_PRICE_PROPLUS = await question('Enter Pro+ plan price ID (price_...): ');
  
  console.log('\n🌐 Site Configuration:');
  envVars.SITE_URL = await question('Enter your site URL (https://your-domain.com): ');
  
  // Create .env file
  const envContent = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  fs.writeFileSync('.env', envContent);
  console.log('\n✅ Environment file created: .env');
  
  // Create Netlify environment file
  const netlifyEnvContent = Object.entries(envVars)
    .map(([key, value]) => `${key}="${value}"`)
    .join('\n');
  
  fs.writeFileSync('netlify-env.txt', netlifyEnvContent);
  console.log('✅ Netlify environment file created: netlify-env.txt');
  
  console.log('\n📋 Next Steps:');
  console.log('1. Copy the contents of netlify-env.txt to your Netlify environment variables');
  console.log('2. Run the database migrations in Supabase');
  console.log('3. Set up Stripe products and webhooks');
  console.log('4. Deploy to Netlify');
  
  console.log('\n🎯 Database Setup Commands:');
  console.log('Run these SQL commands in your Supabase SQL Editor:');
  console.log('1. supabase/migrations/20251001_create_users_table.sql');
  console.log('2. supabase/migrations/20251001_create_documents_table.sql');
  console.log('3. supabase/migrations/20251001_create_subscriptions_table.sql');
  console.log('4. supabase/migrations/20251001_setup_rls_policies.sql');
  
  console.log('\n🔧 Stripe Setup:');
  console.log('1. Create products in Stripe Dashboard');
  console.log('2. Set up webhook endpoint: https://your-domain.com/.netlify/functions/stripe-webhook');
  console.log('3. Configure webhook events');
  
  rl.close();
}

setupEnvironment().catch(console.error);
