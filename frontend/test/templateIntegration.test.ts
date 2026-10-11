import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateTemplateData,
} from '../src/services/templateApi';
import type {
  Campus,
  CampusLocation,
  EventDetails,
  EntryGate,
  SavedTemplateData,
} from '../src/types/bunbetsu';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTemplateIntegrationTests() {
  console.log('--- Running Saved Template Integration Tests ---');

  // =========================================================================
  // 1. Template Data Validation & Serialization Tests
  // =========================================================================
  console.log('1. Testing template validation & serialization...');

  const mockCampus: Campus = {
    id: 'campus-iit-delhi',
    name: 'IIT Delhi',
    fullName: 'Indian Institute of Technology Delhi',
    address: 'Hauz Khas, New Delhi',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    approxAreaHectares: 130,
    boundarySource: 'osm',
    hasBoundary: true,
    center: [77.1928, 28.545],
    defaultZoom: 16,
    defaultLocations: [],
  };

  const mockLocations: CampusLocation[] = [
    {
      id: 'loc-food-court-1',
      name: 'Main Food Plaza',
      activities: ['Food Stalls'],
      area: 2500,
      tags: ['food', 'high-density'],
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.192, 28.544],
            [77.194, 28.544],
            [77.194, 28.546],
            [77.192, 28.546],
            [77.192, 28.544],
          ],
        ],
      },
      center: [77.193, 28.545],
      source: 'preset',
    },
    {
      id: 'loc-custom-hack-arena',
      name: 'Outdoor Hackathon Arena',
      activities: ['Hackathon', 'Music Concert'],
      area: 3200,
      tags: ['custom', 'hackathon'],
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.195, 28.546],
            [77.197, 28.546],
            [77.197, 28.548],
            [77.195, 28.548],
            [77.195, 28.546],
          ],
        ],
      },
      center: [77.196, 28.547],
      source: 'user_drawn',
    },
  ];

  const mockEventDetails: EventDetails = {
    festName: 'Rendezvous 2026',
    durationDays: 4,
    expectedFootfall: 15000,
    startDate: '2026-10-15',
    endDate: '2026-10-18',
  };

  const mockEntryGate: EntryGate = {
    id: 'gate-main-north',
    name: 'Main North Gate',
    coordinates: [77.1925, 28.5442],
  };

  const validSnapshot: SavedTemplateData = {
    schema_version: 1,
    campus: mockCampus,
    allCampusLocations: mockLocations,
    locations: mockLocations,
    eventDetails: mockEventDetails,
    entryGate: mockEntryGate,
  };

  // Test valid snapshot passes validation
  const validationResult = validateTemplateData(validSnapshot);
  assert.strictEqual(validationResult.valid, true, 'Valid snapshot must pass validation');
  assert.ok(validationResult.data, 'Validated snapshot data must be populated');
  assert.strictEqual(validationResult.data?.campus.id, 'campus-iit-delhi');
  assert.strictEqual(validationResult.data?.locations.length, 2);
  assert.strictEqual(validationResult.data?.eventDetails.festName, 'Rendezvous 2026');
  assert.strictEqual(validationResult.data?.eventDetails.durationDays, 4);
  assert.strictEqual(validationResult.data?.eventDetails.expectedFootfall, 15000);
  assert.deepStrictEqual(validationResult.data?.entryGate?.coordinates, [77.1925, 28.5442]);

  // Preserve user-drawn location geometry and properties
  const userDrawnLoc = validationResult.data?.locations.find((l) => l.source === 'user_drawn');
  assert.ok(userDrawnLoc, 'Must preserve user-drawn location');
  assert.strictEqual(userDrawnLoc?.name, 'Outdoor Hackathon Arena');
  assert.deepStrictEqual(userDrawnLoc?.activities, ['Hackathon', 'Music Concert']);
  assert.strictEqual(userDrawnLoc?.geometry.type, 'Polygon');

  console.log('✓ Valid template snapshot validation and preservation passed');

  // =========================================================================
  // 2. Malformed Snapshot Handling Tests
  // =========================================================================
  console.log('2. Testing malformed snapshot error handling...');

  // Null/undefined snapshot
  assert.strictEqual(validateTemplateData(null).valid, false);
  assert.strictEqual(validateTemplateData(undefined).valid, false);
  assert.strictEqual(validateTemplateData('string').valid, false);

  // Missing campus
  const missingCampus = { ...validSnapshot, campus: null };
  assert.strictEqual(validateTemplateData(missingCampus).valid, false);
  assert.ok(validateTemplateData(missingCampus).error?.includes('campus'));

  // Campus missing center coordinates
  const invalidCampusCenter = {
    ...validSnapshot,
    campus: { ...mockCampus, center: [] },
  };
  assert.strictEqual(validateTemplateData(invalidCampusCenter).valid, false);

  // Invalid locations (not an array)
  const invalidLocations = { ...validSnapshot, locations: 'not-an-array' };
  assert.strictEqual(validateTemplateData(invalidLocations).valid, false);

  // Location missing geometry
  const missingGeometry = {
    ...validSnapshot,
    locations: [{ id: 'loc-1', name: 'Zone', activities: ['Sports'], geometry: null }],
  };
  assert.strictEqual(validateTemplateData(missingGeometry).valid, false);

  console.log('✓ Malformed snapshot rejection passed');

  // =========================================================================
  // 3. Nullable Entry Gate Graceful Handling
  // =========================================================================
  console.log('3. Testing snapshot without entry gate (nullable)...');

  const snapshotWithoutGate: SavedTemplateData = {
    ...validSnapshot,
    entryGate: null,
  };
  const gateValidation = validateTemplateData(snapshotWithoutGate);
  assert.strictEqual(gateValidation.valid, true);
  assert.strictEqual(gateValidation.data?.entryGate, null, 'Entry gate can be null in templates');

  console.log('✓ Nullable entry gate validation passed');

  // =========================================================================
  // 4. Source Code Contract Tests (App.tsx, EventConfiguration, Dashboard)
  // =========================================================================
  console.log('4. Testing source code contract compliance...');

  const appPath = path.join(__dirname, '../src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  // Must import and use templateApi methods
  assert.ok(appContent.includes('listSavedTemplates'), 'App.tsx must use listSavedTemplates');
  assert.ok(appContent.includes('saveTemplate'), 'App.tsx must use saveTemplate');
  assert.ok(appContent.includes('deleteSavedTemplate'), 'App.tsx must use deleteSavedTemplate');
  assert.ok(appContent.includes('validateTemplateData'), 'App.tsx must use validateTemplateData');

  // Template restoration contracts
  assert.ok(
    appContent.includes('setSelectedCampus(data.campus)'),
    'App.tsx must restore selectedCampus'
  );
  assert.ok(
    appContent.includes('setLocations(data.locations'),
    'App.tsx must restore active event locations'
  );
  assert.ok(
    appContent.includes('setEventDetails('),
    'App.tsx must restore event details'
  );
  assert.ok(
    appContent.includes('setEntryGate(data.entryGate'),
    'App.tsx must restore entry gate'
  );

  // Stale calculation results must be cleared on template restoration
  assert.ok(
    appContent.includes('setPredictionResult(null)'),
    'App.tsx must reset prediction result on restore'
  );
  assert.ok(
    appContent.includes('setBinRecommendations(null)'),
    'App.tsx must reset bin recommendations on restore'
  );
  assert.ok(
    appContent.includes('setRouteResult(null)'),
    'App.tsx must reset route results on restore'
  );
  assert.ok(
    appContent.includes('setCurrentStep(2)'),
    'App.tsx must navigate to Step 2 (Event Configuration) on restore'
  );

  // EventConfiguration has Save Template action
  const eventConfigPath = path.join(
    __dirname,
    '../src/components/Step2EventConfiguration/EventConfiguration.tsx'
  );
  const eventConfigContent = fs.readFileSync(eventConfigPath, 'utf-8');
  assert.ok(
    eventConfigContent.includes('Save as template'),
    'EventConfiguration must provide Save as template button'
  );
  assert.ok(
    eventConfigContent.includes('onSaveTemplate'),
    'EventConfiguration must support onSaveTemplate prop'
  );

  // SaveTemplateModal exists and handles guest mode restrictions
  const modalPath = path.join(
    __dirname,
    '../src/components/Step2EventConfiguration/SaveTemplateModal.tsx'
  );
  assert.ok(fs.existsSync(modalPath), 'SaveTemplateModal.tsx must exist');
  const modalContent = fs.readFileSync(modalPath, 'utf-8');
  assert.ok(
    modalContent.includes('isGuest'),
    'SaveTemplateModal must handle isGuest prop'
  );
  assert.ok(
    modalContent.includes('Sign in required') || modalContent.includes('Templates require an account'),
    'SaveTemplateModal must explain guest restrictions'
  );

  // DashboardPage contracts: must pass templates and handlers
  const dashboardPagePath = path.join(
    __dirname,
    '../src/components/Dashboard/DashboardPage.tsx'
  );
  const dashboardContent = fs.readFileSync(dashboardPagePath, 'utf-8');
  assert.ok(
    dashboardContent.includes('savedTemplates'),
    'DashboardPage must use savedTemplates'
  );
  assert.ok(
    dashboardContent.includes('onSelectTemplate'),
    'DashboardPage must support onSelectTemplate'
  );
  assert.ok(
    dashboardContent.includes('onDeleteTemplate'),
    'DashboardPage must support onDeleteTemplate'
  );

  // Database security & client contracts: templateApi uses shared client
  const templateApiPath = path.join(__dirname, '../src/services/templateApi.ts');
  const templateApiContent = fs.readFileSync(templateApiPath, 'utf-8');
  assert.ok(
    templateApiContent.includes("from '../lib/supabase'"),
    'templateApi must import shared client from ../lib/supabase'
  );
  assert.ok(
    templateApiContent.includes('supabase.auth.getUser()'),
    'templateApi must verify session via supabase.auth.getUser()'
  );
  assert.ok(
    templateApiContent.includes('.from(\'saved_templates\')'),
    'templateApi must target public.saved_templates'
  );
  assert.ok(
    templateApiContent.includes('updated_at'),
    'templateApi must track updated_at timestamp'
  );

  console.log('✓ Source code contracts verified successfully');
  console.log('All Saved Template integration assertions passed successfully!\n');
}

runTemplateIntegrationTests().catch((err) => {
  console.error('Template integration tests failed:', err);
  process.exit(1);
});

