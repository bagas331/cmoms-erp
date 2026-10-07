import { GET } from '../app/api/requests/approved/route';

async function runApiVerification() {
  console.log('====================================================');
  console.log('🧪 RUNNING APPROVED REQUESTS API (/api/requests/approved) VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      if (detail) console.error(`     Detail: ${detail}`);
    }
  }

  // 1. Unauthenticated request
  {
    const req = new Request('http://localhost:3000/api/requests/approved');
    const res = await GET(req);
    assert(res.status === 401, 'Unauthenticated request returns 401 Unauthorized');
  }

  // 2. Admin access without filters
  {
    const req = new Request('http://localhost:3000/api/requests/approved', {
      headers: {
        'x-user-id': 'admin-001',
        'x-user-role': 'ADMIN',
        'x-user-name': 'Super Admin'
      }
    });
    const res = await GET(req);
    const json = await res.json();
    assert(res.status === 200 && json.success === true, 'Admin request returns 200 OK with success: true');
    assert(Array.isArray(json.data), 'Returns data array of approved requests');
    assert(Boolean(json.pagination), 'Returns pagination metadata');
    assert(Boolean(json.stats), 'Returns summary statistics object');
    assert(typeof json.stats.total_approved === 'number', 'Stats contains total_approved number');
  }

  // 3. Year & Month filtering
  {
    const req = new Request('http://localhost:3000/api/requests/approved?year=2026&month=10', {
      headers: {
        'x-user-id': 'admin-001',
        'x-user-role': 'ADMIN'
      }
    });
    const res = await GET(req);
    const json = await res.json();
    assert(res.status === 200, 'Year + Month query returns 200');
    assert(json.filters_applied.year === '2026', 'Year filter reflected in response');
    assert(json.filters_applied.month === '10', 'Month filter reflected in response');
  }

  // 4. Week of Month filtering
  {
    const req = new Request('http://localhost:3000/api/requests/approved?year=2026&month=10&week=3', {
      headers: {
        'x-user-id': 'admin-001',
        'x-user-role': 'ADMIN'
      }
    });
    const res = await GET(req);
    const json = await res.json();
    assert(res.status === 200, 'Year + Month + Week query returns 200');
    assert(json.filters_applied.week === '3', 'Week filter reflected in response');
  }

  // 5. Search query
  {
    const req = new Request('http://localhost:3000/api/requests/approved?search=REQ', {
      headers: {
        'x-user-id': 'admin-001',
        'x-user-role': 'ADMIN'
      }
    });
    const res = await GET(req);
    const json = await res.json();
    assert(res.status === 200, 'Search query returns 200');
    assert(json.data.every((t: any) => 
      (t.task_code || '').includes('REQ') || 
      (t.campaign_name || '').toLowerCase().includes('req') ||
      (t.client_name || '').toLowerCase().includes('req')
    ), 'Search matches target text accurately');
  }

  console.log(`\n📊 API TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  if (passed === total) {
    console.log('🎉 ALL API TESTS PASSED!');
  } else {
    throw new Error('Some API tests failed.');
  }
}

runApiVerification().catch(err => {
  console.error('API Test failed:', err);
  process.exit(1);
});
