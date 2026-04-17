import { getSession } from './components/Auth.js';

/**
 * Wizard must always send accessToken; use literal 'bypass' when no Supabase session JWT exists.
 */
export async function syncWizardAccessToken(state) {
  const session = await getSession();
  state.accessToken = session?.access_token ?? 'bypass';
}
