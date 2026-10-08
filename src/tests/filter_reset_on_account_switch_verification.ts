import { clearPersistedFilterState, RESET_FILTERS_EVENT } from '../lib/use-persistent-state';

// Mock window and sessionStorage in Node test environment
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
    _getStore: () => store,
  };
})();

let eventDispatched = false;
(global as any).window = {
  sessionStorage: sessionStorageMock,
  dispatchEvent: (event: any) => {
    if (event.type === RESET_FILTERS_EVENT) {
      eventDispatched = true;
    }
  },
};
(global as any).Event = class {
  type: string;
  constructor(type: string) { this.type = type; }
};

async function runVerification() {
  console.log('--- RUNNING FILTER RESET ON ACCOUNT SWITCH TEST ---');
  let passCount = 0;

  // 1. Simulate User A setting various filters in sessionStorage
  sessionStorageMock.setItem('cmos_tasks_filter_status', JSON.stringify('IN_PROGRESS'));
  sessionStorageMock.setItem('cmos_tasks_filter_designer', JSON.stringify('usr-designer-1'));
  sessionStorageMock.setItem('cmos_motion_filter_client', JSON.stringify('Brand X'));
  sessionStorageMock.setItem('cmos_motion_filter_months', JSON.stringify(['01', '02']));
  sessionStorageMock.setItem('other_non_cmos_item', JSON.stringify('stay_intact'));

  if (
    sessionStorageMock.getItem('cmos_tasks_filter_status') === JSON.stringify('IN_PROGRESS') &&
    sessionStorageMock.getItem('cmos_motion_filter_client') === JSON.stringify('Brand X')
  ) {
    console.log('✓ [PASS] Step 1: User A filter states successfully stored in sessionStorage');
    passCount++;
  } else {
    console.error('✗ [FAIL] Step 1: User A filters not set');
  }

  // 2. Clear filters as triggered by account switch / logout / login
  eventDispatched = false;
  clearPersistedFilterState();

  const statusAfter = sessionStorageMock.getItem('cmos_tasks_filter_status');
  const designerAfter = sessionStorageMock.getItem('cmos_tasks_filter_designer');
  const motionClientAfter = sessionStorageMock.getItem('cmos_motion_filter_client');
  const motionMonthsAfter = sessionStorageMock.getItem('cmos_motion_filter_months');
  const nonCmosAfter = sessionStorageMock.getItem('other_non_cmos_item');

  if (
    statusAfter === null &&
    designerAfter === null &&
    motionClientAfter === null &&
    motionMonthsAfter === null
  ) {
    console.log('✓ [PASS] Step 2: All CMOS filter states cleared cleanly on account switch');
    passCount++;
  } else {
    console.error('✗ [FAIL] Step 2: CMOS filters still remained in sessionStorage', { statusAfter, designerAfter });
  }

  if (eventDispatched) {
    console.log('✓ [PASS] Step 3: RESET_FILTERS_EVENT dispatched to reset any mounted hook instances to default values');
    passCount++;
  } else {
    console.error('✗ [FAIL] Step 3: RESET_FILTERS_EVENT was not dispatched');
  }

  console.log(`\n======================================================`);
  console.log(`TOTAL TESTS: 3 | PASSED: ${passCount} | FAILED: ${3 - passCount}`);
  console.log(`======================================================`);

  if (passCount !== 3) {
    process.exit(1);
  }
}

runVerification();
