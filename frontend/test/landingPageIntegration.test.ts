import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runLandingPageIntegrationTests() {
  console.log('--- Running Landing Page Integration Tests ---');

  // 1. LandingPage Component Verification
  const landingPagePath = path.join(__dirname, '../src/components/Landing/LandingPage.tsx');
  assert.ok(fs.existsSync(landingPagePath), 'LandingPage.tsx file must exist');

  const landingPageContent = fs.readFileSync(landingPagePath, 'utf-8');

  // Must export LandingPage component
  assert.ok(
    landingPageContent.includes('export const LandingPage'),
    'LandingPage.tsx must export LandingPage component'
  );

  // Must support onTryNow and onSignIn props
  assert.ok(
    landingPageContent.includes('onTryNow'),
    'LandingPage must accept onTryNow prop'
  );
  assert.ok(
    landingPageContent.includes('onSignIn'),
    'LandingPage must accept onSignIn prop'
  );

  // Must have "Try now" and "Sign in" buttons
  assert.ok(
    landingPageContent.includes('Try now'),
    'LandingPage must render "Try now" button'
  );
  assert.ok(
    landingPageContent.includes('Sign in'),
    'LandingPage must render "Sign in" button'
  );

  // Must wire both actions in the hero section
  assert.ok(
    landingPageContent.includes('onClick={handleTryNow}') || landingPageContent.includes('onClick={onTryNow}'),
    'Try now button must trigger handleTryNow / onTryNow'
  );
  assert.ok(
    landingPageContent.includes('onClick={onSignIn}'),
    'Sign in button must trigger onSignIn'
  );

  console.log('✓ LandingPage.tsx contract assertions passed');

  // 2. App.tsx Integration Verification
  const appPath = path.join(__dirname, '../src/App.tsx');
  assert.ok(fs.existsSync(appPath), 'App.tsx file must exist');

  const appContent = fs.readFileSync(appPath, 'utf-8');

  // App must import LandingPage
  assert.ok(
    appContent.includes("from './components/Landing/LandingPage'"),
    'App.tsx must import LandingPage component'
  );

  // Default view must be 'landing'
  assert.ok(
    appContent.includes("useState<'landing' | 'auth' | 'dashboard' | 'planner'>('landing')"),
    'App.tsx must initialize currentView to "landing"'
  );

  // Must render LandingPage when currentView is 'landing'
  assert.ok(
    appContent.includes('<LandingPage'),
    'App.tsx must render LandingPage'
  );

  // Must wire handleTryNow and handleSignIn to LandingPage
  assert.ok(
    appContent.includes('onTryNow={handleTryNow}'),
    'App.tsx must pass handleTryNow to LandingPage'
  );
  assert.ok(
    appContent.includes('onSignIn={handleSignIn}'),
    'App.tsx must pass handleSignIn to LandingPage'
  );

  // handleSignIn must take user to auth page
  assert.ok(
    appContent.includes("const handleSignIn = () => {") &&
    appContent.includes("setCurrentView('auth')"),
    'handleSignIn must route to auth page via setCurrentView("auth")'
  );

  // handleTryNow must route to campus selection (Step 1 of planner)
  assert.ok(
    appContent.includes("const handleTryNow = () => {"),
    'handleTryNow function must exist in App.tsx'
  );
  assert.ok(
    appContent.includes("setCurrentStep(1)") &&
    appContent.includes("setCurrentView('planner')"),
    'Try now flow must navigate to campus selection page (Step 1 in planner)'
  );

  // Step 1 must render CampusFinder (the campus selection page)
  assert.ok(
    appContent.includes('currentStep === 1 && (') &&
    appContent.includes('<CampusFinder'),
    'Step 1 must render CampusFinder component (campus selection page)'
  );

  // Logout must return to landing page
  assert.ok(
    appContent.includes("handleLogout = async () => {") &&
    appContent.includes("setCurrentView('landing')"),
    'handleLogout must return user to landing page'
  );

  console.log('✓ App.tsx routing and navigation integration assertions passed');

  // 3. AuthPage integration check
  const authPagePath = path.join(__dirname, '../src/components/Auth/AuthPage.tsx');
  const authPageContent = fs.readFileSync(authPagePath, 'utf-8');
  assert.ok(
    authPageContent.includes('onBackToLanding'),
    'AuthPage must support onBackToLanding callback'
  );

  console.log('✓ AuthPage navigation integration assertions passed');

  console.log('All Landing Page integration assertions passed successfully!');
}

runLandingPageIntegrationTests().catch((err) => {
  console.error('Landing page integration tests failed:', err);
  process.exit(1);
});
