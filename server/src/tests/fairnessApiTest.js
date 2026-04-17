// ═══════════════════════════════════════════════════════════
// Full API Integration Test — Tests the HTTP endpoints
// Run: node server/src/tests/fairnessApiTest.js
// ═══════════════════════════════════════════════════════════

const BASE = 'http://localhost:5000/api/fairness';

async function run() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Fairness API — Integration Test');
  console.log('═══════════════════════════════════════════════════\n');

  // Build a test CSV
  const csvLines = ['id,gender,race,actual,predicted,score,ts,model_ver'];
  let id = 1;
  // Male/White: 80% selection, high accuracy
  for (let i = 0; i < 50; i++) {
    const actual = i < 40 ? 1 : 0;
    const predicted = i < 40 ? 1 : 0;
    const score = predicted ? 0.9 : 0.1;
    csvLines.push(`${id++},male,white,${actual},${predicted},${score},2024-01-01,v1`);
  }
  // Female/White: 50% selection (biased by gender)
  for (let i = 0; i < 50; i++) {
    const actual = i < 40 ? 1 : 0;
    const predicted = i < 25 ? 1 : 0;
    const score = predicted ? 0.7 : 0.3;
    csvLines.push(`${id++},female,white,${actual},${predicted},${score},2024-01-01,v1`);
  }
  // Male/Black: 60% selection (biased by race)
  for (let i = 0; i < 50; i++) {
    const actual = i < 40 ? 1 : 0;
    const predicted = i < 30 ? 1 : 0;
    const score = predicted ? 0.8 : 0.2;
    csvLines.push(`${id++},male,black,${actual},${predicted},${score},2024-01-02,v1`);
  }
  // Female/Black: 30% selection (double bias)
  for (let i = 0; i < 50; i++) {
    const actual = i < 40 ? 1 : 0;
    const predicted = i < 15 ? 1 : 0;
    const score = predicted ? 0.6 : 0.25;
    csvLines.push(`${id++},female,black,${actual},${predicted},${score},2024-01-02,v1`);
  }

  const csvContent = csvLines.join('\n');

  const config = JSON.stringify({
    dataset_name: 'API Integration Test',
    column_mappings: {
      record_id: 'id',
      target_outcome: 'actual',
      predicted_outcome: 'predicted',
      predicted_score: 'score',
      timestamp: 'ts',
      model_version: 'model_ver',
    },
    protected_attributes: [
      { column: 'gender', reference_group: 'male' },
      { column: 'race', reference_group: 'white' },
    ],
    thresholds: {
      statistical_parity_difference: 0.1,
      disparate_impact_ratio_min: 0.8,
      disparate_impact_ratio_max: 1.25,
      equal_opportunity_difference: 0.1,
      average_odds_difference: 0.1,
    },
  });

  // ── Step 1: Upload ─────────────────────────────────────
  console.log('📤 Step 1: Upload dataset...');
  const boundary = '----FormBoundary' + Date.now();
  const formBody = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="test_data.csv"',
    'Content-Type: text/csv',
    '',
    csvContent,
    `--${boundary}`,
    'Content-Disposition: form-data; name="config"',
    '',
    config,
    `--${boundary}--`,
  ].join('\r\n');

  const uploadRes = await fetch(`${BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: formBody,
  });
  const uploadData = await uploadRes.json();
  console.log(`   Status: ${uploadRes.status}`);
  console.log(`   Dataset ID: ${uploadData.dataset_id}`);
  console.log(`   Row count: ${uploadData.row_count}`);
  console.log(`   Profile groups: ${JSON.stringify(Object.keys(uploadData.profile?.group_distributions || {}))}`);
  check(uploadRes.status === 201, 'Upload returns 201');
  check(uploadData.row_count === 200, 'Row count = 200');
  check(uploadData.dataset_id != null, 'Dataset ID returned');

  const datasetId = uploadData.dataset_id;

  // ── Step 2: List datasets ──────────────────────────────
  console.log('\n📋 Step 2: List datasets...');
  const listRes = await fetch(`${BASE}/datasets`);
  const listData = await listRes.json();
  console.log(`   Total datasets: ${listData.total}`);
  check(listData.total >= 1, 'At least 1 dataset listed');

  // ── Step 3: Get dataset details ────────────────────────
  console.log('\n🔎 Step 3: Get dataset details...');
  const detailRes = await fetch(`${BASE}/datasets/${datasetId}`);
  const detailData = await detailRes.json();
  console.log(`   Name: ${detailData.name}`);
  console.log(`   Status: ${detailData.status}`);
  check(detailData.status === 'profiled', 'Status is profiled after upload');

  // ── Step 4: Run analysis ───────────────────────────────
  console.log('\n🔬 Step 4: Run fairness analysis...');
  const analyzeRes = await fetch(`${BASE}/datasets/${datasetId}/analyze`, { method: 'POST' });
  const analyzeData = await analyzeRes.json();
  console.log(`   Risk level: ${analyzeData.report?.risk_level}`);
  console.log(`   Violations: ${analyzeData.report?.violation_count}`);
  check(analyzeRes.status === 200, 'Analysis returns 200');
  check(analyzeData.report?.risk_level != null, 'Report has risk level');
  check(analyzeData.report?.violation_count > 0, 'Violations detected in biased dataset');

  // Print violations
  if (analyzeData.report?.violations) {
    console.log('   Violations found:');
    for (const v of analyzeData.report.violations) {
      console.log(`     - [${v.severity.toUpperCase()}] ${v.metric}: ${v.message}`);
    }
  }

  // ── Step 5: Get report ─────────────────────────────────
  console.log('\n📊 Step 5: Retrieve report...');
  const reportRes = await fetch(`${BASE}/datasets/${datasetId}/report`);
  const reportData = await reportRes.json();
  check(reportRes.status === 200, 'Report endpoint returns 200');
  check(reportData.report?.summary != null, 'Report has summary text');
  console.log(`   Summary: ${reportData.report?.summary}`);

  // ── Step 6: Get audit trail ────────────────────────────
  console.log('\n🔒 Step 6: Check audit trail...');
  const auditRes = await fetch(`${BASE}/datasets/${datasetId}/audit-trail`);
  const auditData = await auditRes.json();
  console.log(`   Trail entries: ${auditData.total}`);
  for (const entry of auditData.audit_trail || []) {
    console.log(`     - [${entry.timestamp}] ${entry.action} by ${entry.actor}`);
  }
  check(auditData.total >= 3, 'Audit trail has upload + profile + analyze entries');

  // ── Step 7: Check review queue ─────────────────────────
  console.log('\n⚠️  Step 7: Check review queue...');
  const queueRes = await fetch(`${BASE}/review-queue?dataset_id=${datasetId}`);
  const queueData = await queueRes.json();
  console.log(`   Queue items: ${queueData.total}`);
  check(queueData.total > 0, 'Review queue has items');

  // Update first item
  if (queueData.items?.length > 0) {
    const itemId = queueData.items[0].id;
    console.log(`\n📝 Step 7b: Update review item ${itemId.slice(0,8)}...`);
    const patchRes = await fetch(`${BASE}/review-queue/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'acknowledged', reviewer: 'test@test.com', review_notes: 'Investigating' }),
    });
    const patchData = await patchRes.json();
    check(patchData.item?.status === 'acknowledged', 'Review item status updated');
  }

  // ── Done ───────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(failCount > 0 ? 1 : 0);
}

let passCount = 0, failCount = 0;
function check(cond, msg) {
  if (cond) { console.log(`   ✅ ${msg}`); passCount++; }
  else { console.error(`   ❌ ${msg}`); failCount++; }
}

run().catch((err) => { console.error('💥 Fatal:', err); process.exit(1); });
