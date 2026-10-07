import { GET } from '../app/api/motion/approved/route';

async function testApi() {
  console.log('Testing GET /api/motion/approved...');
  const req = new Request('http://localhost:3000/api/motion/approved?year=2026&month=10&sort=approved_desc', {
    headers: {
      'x-user-id': '00000000-0000-0000-0000-000000000001',
      'x-user-role': 'ADMIN',
      'x-user-name': 'Super Admin'
    }
  });

  const res = await GET(req);
  const json = await res.json();
  console.log('Status:', res.status);
  console.log('Success:', json.success);
  console.log('Stats:', json.stats);
  console.log('Pagination:', json.pagination);
  console.log('Total items in response:', json.data?.length);

  if (res.status === 200 && json.success) {
    console.log('✅ /api/motion/approved API route verified successfully!');
  } else {
    throw new Error('API route test failed');
  }
}

testApi().catch(err => {
  console.error(err);
  process.exit(1);
});
