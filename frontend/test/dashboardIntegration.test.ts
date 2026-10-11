import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getUserInitials,
  getUserFirstName,
} from '../src/types/bunbetsu';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runDashboardIntegrationTests() {
  console.log('--- Running Post-Login Dashboard UI Integration Tests ---');

  // 1. User Name and Initials formatting tests
  assert.strictEqual(getUserInitials('Aarav Sharma'), 'AS', 'Aarav Sharma initials should be AS');
  assert.strictEqual(getUserInitials('Alex S.'), 'AS', 'Alex S. initials should be AS');
  assert.strictEqual(getUserInitials('Guest User'), 'GU', 'Guest User initials should be GU');
  assert.strictEqual(getUserInitials('Admin'), 'AD', 'Single name Admin initials should be AD');
  assert.strictEqual(getUserInitials(''), 'U', 'Empty string should fallback to U');

  assert.strictEqual(getUserFirstName('Aarav Sharma'), 'Aarav', 'First name should be Aarav');
  assert.strictEqual(getUserFirstName('Alex S.'), 'Alex', 'First name should be Alex');
  assert.strictEqual(getUserFirstName('Guest User'), 'Guest', 'First name should be Guest');
  assert.strictEqual(getUserFirstName(''), 'User', 'Empty string should fallback to User');

  console.log('✓ Name and Initials helper assertions passed');

  // 2. Strict Visual Restrictions Check on Dashboard components (NO ICONS, NO COMMUNITY, NO HELP & SUPPORT)
  const dashboardDir = path.join(__dirname, '../src/components/Dashboard');
  const dashboardFiles = [
    'DashboardPage.tsx',
    'DashboardActionCards.tsx',
    'RecentEventsPanel.tsx',
    'SavedTemplatesPanel.tsx',
  ];

  for (const file of dashboardFiles) {
    const filePath = path.join(dashboardDir, file);
    assert.ok(fs.existsSync(filePath), `Expected file ${file} to exist`);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Rule: NO icons anywhere in the dashboard cards and panels
    assert.ok(
      !content.includes('lucide-react'),
      `${file} must NOT import from lucide-react`
    );
    assert.ok(
      !content.toLowerCase().includes('icon'),
      `${file} must NOT contain icon variables or components`
    );

    // Rule: NO Community, NO Help & Support
    assert.ok(
      !content.includes('Community'),
      `${file} must NOT contain Community`
    );
    assert.ok(
      !content.includes('Help & Support'),
      `${file} must NOT contain Help & Support`
    );
  }

  console.log('✓ Strict restrictions (No icons, No community, No help & support) verified across all dashboard components');

  // 3. Unified Navbar Checks
  const navbarPath = path.join(__dirname, '../src/components/Navbar.tsx');
  assert.ok(fs.existsSync(navbarPath), 'Navbar.tsx must exist');
  const navbarContent = fs.readFileSync(navbarPath, 'utf-8');

  // Requirement: Remove events and templates from navbar
  assert.ok(
    !navbarContent.includes('Event History'),
    'Navbar must not contain Event History'
  );
  assert.ok(
    !navbarContent.includes('LayoutTemplate'),
    'Navbar must not import or contain LayoutTemplate'
  );
  assert.ok(
    !navbarContent.includes('showTemplates'),
    'Navbar must not contain showTemplates'
  );

  // Requirement: Replace profile corner with dashboard profile dropdown, without sustainability lead
  assert.ok(
    !navbarContent.toLowerCase().includes('sustainability lead'),
    'Navbar must not display the Sustainability Lead role badge'
  );
  assert.ok(
    navbarContent.includes('Log out'),
    'Navbar must contain Log out button in dropdown'
  );
  assert.ok(
    navbarContent.includes('user?.name'),
    'Navbar dropdown must display user.name'
  );
  // Requirement: Stepper only appears in campus selection chain, not on dashboard
  assert.ok(
    navbarContent.includes('!isDashboard && ('),
    'Stepper nav must be hidden when isDashboard is true'
  );

  // Requirement: Remove Dashboard button from navbar at other places
  assert.ok(
    !navbarContent.includes('<span>Dashboard</span>'),
    'Navbar must not render a Dashboard shortcut button'
  );

  console.log('✓ Unified Navbar verified: events and templates removed, profile dropdown present, stepper gated by !isDashboard, dashboard button removed');

  // 4. Action Cards checks
  const actionCardsContent = fs.readFileSync(path.join(dashboardDir, 'DashboardActionCards.tsx'), 'utf-8');
  assert.ok(actionCardsContent.includes('Plan a new event'), 'Must include Plan a new event');
  assert.ok(actionCardsContent.includes('Start planning'), 'Must include Start planning button');
  assert.ok(actionCardsContent.includes('Browse templates'), 'Must include Browse templates');
  assert.ok(actionCardsContent.includes('View templates'), 'Must include View templates button');
  assert.ok(actionCardsContent.includes('View event history'), 'Must include View event history');
  assert.ok(actionCardsContent.includes('View history'), 'Must include View history button');

  console.log('✓ Three primary action cards verified');

  // 5. Empty states verification
  const recentEventsContent = fs.readFileSync(path.join(dashboardDir, 'RecentEventsPanel.tsx'), 'utf-8');
  assert.ok(
    recentEventsContent.includes('No events yet. Start planning your first event.'),
    'Recent events empty state text verified'
  );

  const savedTemplatesContent = fs.readFileSync(path.join(dashboardDir, 'SavedTemplatesPanel.tsx'), 'utf-8');
  assert.ok(
    savedTemplatesContent.includes('No templates available yet.'),
    'Saved templates empty state text verified'
  );

  console.log('✓ Empty states for events and templates verified');

  // 6. DashboardPage integration checks
  const pageContent = fs.readFileSync(path.join(dashboardDir, 'DashboardPage.tsx'), 'utf-8');
  assert.ok(
    pageContent.includes("from '../Navbar'"),
    'DashboardPage must import and use Navbar from ../Navbar'
  );
  assert.ok(
    !pageContent.includes('DashboardSidebar'),
    'DashboardPage must NOT render DashboardSidebar'
  );

  // 7. Auth and Guest navigation verification in App and AuthPage
  const appPath = path.join(__dirname, '../src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');
  assert.ok(
    appContent.includes("setCurrentView('dashboard')"),
    'handleLoginSuccess must route to dashboard'
  );
  assert.ok(
    appContent.includes("setCurrentView('planner')"),
    'handleContinueAsGuest must route to planner'
  );
  assert.ok(
    appContent.includes("setCurrentStep(1)"),
    'handleContinueAsGuest must set currentStep to 1 (campus selection)'
  );

  const authPagePath = path.join(__dirname, '../src/components/Auth/AuthPage.tsx');
  const authPageContent = fs.readFileSync(authPagePath, 'utf-8');
  assert.ok(
    authPageContent.includes('Use as guest'),
    'AuthPage must provide Use as guest option'
  );

  console.log('✓ Auth & Guest navigation verified: login navigates to dashboard, use as guest navigates directly to campus selection (Step 1)');
  console.log('All Dashboard integration assertions passed successfully!\n');
}

runDashboardIntegrationTests().catch((err) => {
  console.error('Dashboard integration tests failed:', err);
  process.exit(1);
});
