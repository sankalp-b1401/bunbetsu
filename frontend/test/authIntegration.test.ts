import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  constructDisplayName,
  buildAuthUserFromSession,
  isSupabaseConfigured,
  fetchUserProfile,
} from '../src/lib/supabase';
import type { AuthUser } from '../src/types/bunbetsu';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAuthIntegrationTests() {
  console.log('--- Running Supabase Auth & User Profile Integration Tests ---');

  // =========================================================================
  // 1. Display Name Construction and Missing Profile Graceful Fallback Tests
  // =========================================================================
  console.log('1. Testing display name construction...');
  // Standard first + last name
  assert.strictEqual(
    constructDisplayName('Aarav', 'Sharma'),
    'Aarav Sharma',
    'Display name should combine first and last name'
  );

  // Whitespace trimming
  assert.strictEqual(
    constructDisplayName('  Meera  ', '  Iyer  '),
    'Meera Iyer',
    'Display name should trim leading/trailing whitespace'
  );

  // First name only
  assert.strictEqual(
    constructDisplayName('Priya', null),
    'Priya',
    'Display name with only first name should be first name'
  );

  // Last name only
  assert.strictEqual(
    constructDisplayName(null, 'Verma'),
    'Verma',
    'Display name with only last name should be last name'
  );

  // Missing profile record: fallback to metadata full_name
  assert.strictEqual(
    constructDisplayName(null, null, 'Rohan Joshi', 'rohan@univ.edu'),
    'Rohan Joshi',
    'Display name should fall back to metadata full name when profile is missing'
  );

  // Missing profile record & metadata: fallback to formatted email username
  assert.strictEqual(
    constructDisplayName(null, null, null, 'sankalp.b1401@gmail.com'),
    'Sankalp B1401',
    'Display name should format email username nicely when names are missing'
  );

  // Missing everything: fallback to generic "User" without inventing an identity
  assert.strictEqual(
    constructDisplayName(null, null, null, null),
    'User',
    'Display name should fall back to "User" without inventing mock identity'
  );

  assert.notStrictEqual(
    constructDisplayName(null, null, null, null),
    'Aarav Sharma',
    'Must NOT invent mock Aarav Sharma identity when profile is missing'
  );

  console.log('✓ Display name construction and fallback assertions passed');

  // =========================================================================
  // 2. AuthUser Interface & Mapping Contract Tests
  // =========================================================================
  console.log('2. Testing AuthUser interface compatibility...');
  // Guest user compatibility
  const guestUser: AuthUser = {
    name: 'Guest User',
    email: 'guest@bunbetsu.app',
    role: 'Guest Planner',
    isGuest: true,
  };
  assert.strictEqual(guestUser.id, undefined, 'Guest user id should be optional');
  assert.strictEqual(guestUser.isGuest, true, 'Guest user should have isGuest: true');

  // Authenticated user compatibility
  const authUser: AuthUser = {
    id: 'user-uuid-1234',
    name: 'Kabir Das',
    email: 'kabir@university.edu',
    isGuest: false,
  };
  assert.strictEqual(authUser.id, 'user-uuid-1234', 'Authenticated user must store Supabase UUID');
  assert.strictEqual(authUser.isGuest, false, 'Authenticated user must have isGuest: false');
  assert.strictEqual(authUser.role, undefined, 'Authenticated user must not require role');

  // Mapping from session user
  const mappedUser = await buildAuthUserFromSession({
    id: 'user-5678',
    email: 'dev@bunbetsu.app',
    user_metadata: {
      first_name: 'Dev',
      last_name: 'User',
    },
  });

  assert.ok(mappedUser, 'mappedUser should not be null');
  assert.strictEqual(mappedUser?.id, 'user-5678');
  assert.strictEqual(mappedUser?.name, 'Dev User');
  assert.strictEqual(mappedUser?.email, 'dev@bunbetsu.app');
  assert.strictEqual(mappedUser?.isGuest, false);

  console.log('✓ AuthUser contract & mapping assertions passed');

  // =========================================================================
  // 3. AuthPage Component Implementation Contract Tests
  // =========================================================================
  console.log('3. Testing AuthPage.tsx implementation contracts...');
  const authPagePath = path.join(__dirname, '../src/components/Auth/AuthPage.tsx');
  const authPageContent = fs.readFileSync(authPagePath, 'utf-8');

  // Verify simulated auth setTimeout was removed
  assert.ok(
    !authPageContent.includes('// Simulate snappy authentication flow'),
    'AuthPage must not simulate authentication with setTimeout'
  );
  assert.ok(
    !authPageContent.includes('"Aarav Sharma"'),
    'AuthPage must not hardcode demo user "Aarav Sharma"'
  );
  assert.ok(
    !authPageContent.includes('"Sustainability Lead"'),
    'AuthPage must not hardcode demo role "Sustainability Lead"'
  );

  // Verify real Supabase auth calls
  assert.ok(
    authPageContent.includes('supabase.auth.signUp'),
    'AuthPage must call supabase.auth.signUp for signup'
  );
  assert.ok(
    authPageContent.includes('first_name: firstName.trim()'),
    'AuthPage must pass first_name in user metadata'
  );
  assert.ok(
    authPageContent.includes('last_name: lastName.trim()'),
    'AuthPage must pass last_name in user metadata'
  );
  assert.ok(
    authPageContent.includes('supabase.auth.signInWithPassword'),
    'AuthPage must call supabase.auth.signInWithPassword for login'
  );
  assert.ok(
    authPageContent.includes('data.user && !data.session'),
    'AuthPage must treat signup without session as pending confirmation'
  );
  assert.ok(
    authPageContent.includes('setPendingConfirmation(true)'),
    'AuthPage must set pending confirmation state on email-confirmation signup'
  );
  assert.ok(
    !authPageContent.includes('Continue with Google'),
    'AuthPage must not include Google sign-in button'
  );
  assert.ok(
    !authPageContent.includes('signInWithOAuth'),
    'AuthPage must not invoke signInWithOAuth'
  );
  assert.ok(
    authPageContent.includes('supabase.auth.resetPasswordForEmail'),
    'AuthPage must call supabase.auth.resetPasswordForEmail'
  );
  assert.ok(
    authPageContent.includes('Use as guest'),
    'AuthPage must preserve guest workflow option'
  );

  console.log('✓ AuthPage implementation contracts verified');

  // =========================================================================
  // 4. App Session Restoration and Logout Implementation Contract Tests
  // =========================================================================
  console.log('4. Testing App.tsx session restoration & logout contracts...');
  const appPath = path.join(__dirname, '../src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  assert.ok(
    appContent.includes('supabase.auth.onAuthStateChange'),
    'App.tsx must subscribe to supabase.auth.onAuthStateChange'
  );
  assert.ok(
    appContent.includes('subscription.unsubscribe()'),
    'App.tsx must clean up auth listener subscription'
  );
  assert.ok(
    appContent.includes('supabase.auth.signOut()'),
    'App.tsx handleLogout must call supabase.auth.signOut()'
  );
  assert.ok(
    appContent.includes('isAuthInitializing'),
    'App.tsx must track session restoration initialization state'
  );
  assert.ok(
    appContent.includes('Restoring session...'),
    'App.tsx must show loading state while restoring session'
  );
  assert.ok(
    appContent.includes('setTimeout('),
    'App.tsx must schedule profile queries outside auth-state callback to avoid deadlocks'
  );
  assert.ok(
    appContent.includes("setCurrentView('dashboard')"),
    'App.tsx must route authenticated users to dashboard'
  );
  assert.ok(
    appContent.includes("setCurrentView('planner')"),
    'App.tsx must preserve guest planner route'
  );

  console.log('✓ App.tsx session restoration & logout contracts verified');

  // =========================================================================
  // 5. Supabase Client & Environment Security Verification
  // =========================================================================
  console.log('5. Testing Supabase client and environment variable security...');
  const supabaseLibPath = path.join(__dirname, '../src/lib/supabase.ts');
  assert.ok(fs.existsSync(supabaseLibPath), 'src/lib/supabase.ts must exist');
  const supabaseLibContent = fs.readFileSync(supabaseLibPath, 'utf-8');

  assert.ok(
    supabaseLibContent.includes('VITE_SUPABASE_URL'),
    'supabase.ts must read VITE_SUPABASE_URL'
  );
  assert.ok(
    supabaseLibContent.includes('VITE_SUPABASE_PUBLISHABLE_KEY'),
    'supabase.ts must read VITE_SUPABASE_PUBLISHABLE_KEY'
  );
  assert.ok(
    !supabaseLibContent.includes('service_role'),
    'supabase.ts must NEVER contain or use service_role key'
  );
  assert.ok(
    !supabaseLibContent.includes('SUPABASE_SECRET'),
    'supabase.ts must NEVER contain or use secret keys'
  );

  const envExamplePath = path.join(__dirname, '../.env.example');
  assert.ok(fs.existsSync(envExamplePath), '.env.example must exist');
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf-8');
  assert.ok(
    envExampleContent.includes('VITE_SUPABASE_URL='),
    '.env.example must document VITE_SUPABASE_URL'
  );
  assert.ok(
    envExampleContent.includes('VITE_SUPABASE_PUBLISHABLE_KEY='),
    '.env.example must document VITE_SUPABASE_PUBLISHABLE_KEY'
  );
  assert.ok(
    envExampleContent.includes('Redirect URLs:'),
    '.env.example must document redirect URLs'
  );

  console.log('✓ Supabase client and env security verified');
  console.log('All Supabase Auth & Profile integration assertions passed successfully!\n');
}

runAuthIntegrationTests().catch((err) => {
  console.error('Supabase Auth integration tests failed:', err);
  process.exit(1);
});

