// ═══════════════════════════════════════════════════════════
// Fairness Auditing System — End-to-End Test
// Generates test data, uploads, analyzes, and verifies.
// Run: node server/src/tests/fairnessTest.js
// ═══════════════════════════════════════════════════════════

import '../loadEnv.js';
import { getDb, closeDb } from '../db/database.js';
import { parseCSV } from '../fairness/utils/csvParser.js';
import { validateConfig, validateDatasetSchema } from '../fairness/utils/validation.js';
import { confusionMatrix, safeDiv, groupBy, round } from '../fairness/utils/mathHelpers.js';
import { computeAllMetrics } from '../fairness/services/fairnessMetrics.js';
import { profileDataset } from '../fairness/services/datasetProfiler.js';
import { logAuditEvent, generateReport, getAuditTrail, getReviewQueue } from '../fairness/services/auditService.js';
import { v4 as uuidv4 } from 'uuid';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// ───────────────────────────────────────────────────────────
// Test 1: Math Helpers
// ───────────────────────────────────────────────────────────
function testMathHelpers() {
  console.log('\n🧮 Test 1: Math Helpers');

  assert(safeDiv(10, 2) === 5, 'safeDiv(10, 2) === 5');
  assert(safeDiv(1, 0) === null, 'safeDiv(1, 0) === null');
  assert(safeDiv(0, 0) === null, 'safeDiv(0, 0) === null');

  const cm = confusionMatrix([1,1,0,0,1], [1,0,0,1,1]);
  assert(cm.tp === 2, 'confusionMatrix TP = 2');
  assert(cm.fn === 1, 'confusionMatrix FN = 1');
  assert(cm.fp === 1, 'confusionMatrix FP = 1');
  assert(cm.tn === 1, 'confusionMatrix TN = 1');

  const groups = groupBy([{a:1},{a:2},{a:1}], r => r.a);
  assert(groups.size === 2, 'groupBy creates 2 groups');
  assert(groups.get('1').length === 2, 'groupBy group "1" has 2 items');

  assert(round(0.123456789, 4) === 0.1235, 'round to 4 places');
  assert(round(null) === null, 'round(null) === null');
}

// ───────────────────────────────────────────────────────────
// Test 2: CSV Parser
// ───────────────────────────────────────────────────────────
function testCSVParser() {
  console.log('\n📄 Test 2: CSV Parser');

  const csv = `id,name,score
1,Alice,0.95
2,Bob,0.42
3,"Charlie, Jr.",0.78
4,Diana,`;

  const { rows, headers, rowCount } = parseCSV(csv);
  assert(headers.length === 3, 'Parses 3 headers');
  assert(rowCount === 4, 'Parses 4 rows');
  assert(rows[0].id === 1, 'Coerces numeric values');
  assert(rows[2].name === 'Charlie, Jr.', 'Handles quoted commas');
  assert(rows[3].score === null, 'Coerces empty to null');

  // Edge case: quoted fields with escaped quotes
  const csv2 = `col1,col2
"He said ""hello""",value2`;
  const { rows: rows2 } = parseCSV(csv2);
  assert(rows2[0].col1 === 'He said "hello"', 'Handles escaped quotes');
}

// ───────────────────────────────────────────────────────────
// Test 3: Config Validation
// ───────────────────────────────────────────────────────────
function testValidation() {
  console.log('\n🔍 Test 3: Config Validation');

  // Valid config
  const validConfig = {
    dataset_name: 'Test Dataset',
    column_mappings: {
      record_id: 'id',
      target_outcome: 'actual',
      predicted_outcome: 'predicted',
      timestamp: 'ts',
      model_version: 'ver',
    },
    protected_attributes: [
      { column: 'gender', reference_group: 'male' },
    ],
  };

  const v1 = validateConfig(validConfig);
  assert(v1.valid === true, 'Valid config passes validation');
  assert(v1.errors.length === 0, 'No errors on valid config');

  // Missing required fields
  const v2 = validateConfig({});
  assert(v2.valid === false, 'Empty config fails validation');
  assert(v2.errors.length >= 3, 'Reports multiple missing fields');

  // Invalid threshold
  const v3 = validateConfig({ ...validConfig, thresholds: { unknown_key: 0.5 } });
  assert(v3.valid === false, 'Unknown threshold key rejected');

  // Null config
  const v4 = validateConfig(null);
  assert(v4.valid === false, 'Null config rejected');
}

// ───────────────────────────────────────────────────────────
// Test 4: Fairness Metrics (known values)
// ───────────────────────────────────────────────────────────
function testFairnessMetrics() {
  console.log('\n📊 Test 4: Fairness Metrics');

  // Create a dataset with known bias:
  // Group A (reference): 80% selection rate, high TPR
  // Group B: 40% selection rate, low TPR (disadvantaged)
  const rows = [];

  // Group A: 100 records, 80 selected, high accuracy
  for (let i = 0; i < 100; i++) {
    rows.push({
      id: i,
      group: 'A',
      actual: i < 80 ? 1 : 0,  // 80 positive
      predicted: i < 80 ? 1 : 0, // mostly correct
      score: i < 80 ? 0.9 : 0.1,
      ts: '2024-01-01',
      ver: 'v1',
    });
  }

  // Group B: 100 records, 80 qualified but only 40 selected
  for (let i = 0; i < 100; i++) {
    rows.push({
      id: 100 + i,
      group: 'B',
      actual: i < 80 ? 1 : 0,  // 80 positive (same qualification rate)
      predicted: i < 40 ? 1 : 0, // only 40 selected (biased!)
      score: i < 40 ? 0.7 : 0.3,
      ts: '2024-01-01',
      ver: 'v1',
    });
  }

  const config = {
    dataset_name: 'Bias Test',
    column_mappings: {
      record_id: 'id',
      target_outcome: 'actual',
      predicted_outcome: 'predicted',
      predicted_score: 'score',
      timestamp: 'ts',
      model_version: 'ver',
    },
    protected_attributes: [
      { column: 'group', reference_group: 'A' },
    ],
  };

  const metrics = computeAllMetrics(rows, config);

  assert(metrics.total_records === 200, 'Total records = 200');
  assert(metrics.per_attribute.group != null, 'Has group attribute');

  const groupData = metrics.per_attribute.group;

  // Group A selection rate should be 0.8
  assert(groupData.groups['A'].selection_rate === 0.8, 'Group A selection rate = 0.8');

  // Group B selection rate should be 0.4
  assert(groupData.groups['B'].selection_rate === 0.4, 'Group B selection rate = 0.4');

  // Statistical parity difference should be -0.4 (B - A)
  const spd = groupData.fairness_metrics['B'].statistical_parity_difference;
  assert(spd === -0.4, `SPD = -0.4 (got ${spd})`);

  // Disparate impact ratio should be 0.5 (0.4 / 0.8)
  const dir = groupData.fairness_metrics['B'].disparate_impact_ratio;
  assert(dir === 0.5, `DIR = 0.5 (got ${dir})`);

  // Group A TPR should be 1.0 (all 80 positives correctly predicted)
  assert(groupData.groups['A'].true_positive_rate === 1, 'Group A TPR = 1.0');

  // Group B TPR should be 0.5 (40 out of 80 positives predicted)
  assert(groupData.groups['B'].true_positive_rate === 0.5, 'Group B TPR = 0.5');

  // Equal opportunity difference: 0.5 - 1.0 = -0.5
  const eod = groupData.fairness_metrics['B'].equal_opportunity_difference;
  assert(eod === -0.5, `EOD = -0.5 (got ${eod})`);

  // Representation skew — equal groups, should be ~1.0
  const skew = groupData.advanced.representation_skew;
  assert(skew['A'].skew_ratio === 1, 'Group A skew = 1.0 (balanced)');
  assert(skew['B'].skew_ratio === 1, 'Group B skew = 1.0 (balanced)');

  // Calibration should exist
  assert(groupData.advanced.calibration != null, 'Calibration computed');
  assert(groupData.advanced.calibration['A'].mean_predicted_score != null, 'Group A calibration has score');

  // Missingness
  assert(groupData.advanced.missingness != null, 'Missingness computed');
}

// ───────────────────────────────────────────────────────────
// Test 5: Dataset Profiler
// ───────────────────────────────────────────────────────────
function testProfiler() {
  console.log('\n📈 Test 5: Dataset Profiler');

  const rows = [
    { id: 1, gender: 'M', outcome: 1, pred: 1, ts: '2024-01-01', ver: 'v1' },
    { id: 2, gender: 'F', outcome: 0, pred: 0, ts: '2024-01-02', ver: 'v1' },
    { id: 3, gender: 'F', outcome: 1, pred: 0, ts: '2024-01-03', ver: 'v2' },
    { id: 4, gender: 'M', outcome: 1, pred: 1, ts: '2024-01-04', ver: 'v2' },
    { id: 5, gender: 'M', outcome: 0, pred: null, ts: '2024-01-05', ver: 'v2' },
  ];

  const config = {
    dataset_name: 'Profile Test',
    column_mappings: {
      record_id: 'id',
      target_outcome: 'outcome',
      predicted_outcome: 'pred',
      timestamp: 'ts',
      model_version: 'ver',
    },
    protected_attributes: [{ column: 'gender', reference_group: 'M' }],
  };

  const profile = profileDataset(rows, config);

  assert(profile.total_rows === 5, 'Total rows = 5');
  assert(profile.total_columns === 6, 'Total columns = 6');
  assert(profile.group_distributions.gender != null, 'Has gender distribution');
  assert(profile.group_distributions.gender.total_groups === 2, 'Gender has 2 groups');
  assert(profile.timestamp_range.earliest === '2024-01-01', 'Earliest timestamp correct');
  assert(profile.timestamp_range.latest === '2024-01-05', 'Latest timestamp correct');
  assert(profile.model_versions.unique_values === 2, '2 model versions');
}

// ───────────────────────────────────────────────────────────
// Test 6: Audit Service (DB integration)
// ───────────────────────────────────────────────────────────
function testAuditService() {
  console.log('\n🔒 Test 6: Audit Service');

  const db = getDb();
  const datasetId = uuidv4();

  // Log events
  logAuditEvent(db, { datasetId, action: 'test_upload', details: { test: true }, actor: 'test-runner' });
  logAuditEvent(db, { datasetId, action: 'test_analyze', details: { metrics: 'computed' }, actor: 'test-runner' });

  // Retrieve trail
  const trail = getAuditTrail(db, datasetId);
  assert(trail.length === 2, 'Audit trail has 2 entries');
  assert(trail[0].action === 'test_upload', 'First event is test_upload');
  assert(trail[1].action === 'test_analyze', 'Second event is test_analyze');
  assert(trail[0].actor === 'test-runner', 'Actor recorded correctly');

  // Test report generation
  const profile = { total_rows: 200, total_columns: 5 };
  const metrics = {
    per_attribute: {
      gender: {
        fairness_metrics: {
          female: {
            statistical_parity_difference: -0.3,
            disparate_impact_ratio: 0.6,
            equal_opportunity_difference: -0.2,
            average_odds_difference: -0.15,
          },
        },
      },
    },
  };
  const config = {
    dataset_name: 'Test',
    column_mappings: { target_outcome: 'actual', predicted_outcome: 'pred' },
    protected_attributes: [{ column: 'gender', reference_group: 'male' }],
  };

  const report = generateReport(db, datasetId, profile, metrics, config);
  assert(report.risk_level === 'high', 'Risk level is HIGH (DIR < 0.8)');
  assert(report.violation_count > 0, `Violations found: ${report.violation_count}`);
  assert(report.report_id != null, 'Report has ID');

  // Check review queue
  const queue = getReviewQueue(db, { dataset_id: datasetId });
  assert(queue.total > 0, `Review queue has ${queue.total} items`);
  assert(queue.items[0].severity === 'high', 'First item is high severity');

  // Cleanup test data
  // fairness_audit_logs is immutable by design; do not delete from it in tests.
  db.prepare('DELETE FROM fairness_reports WHERE dataset_id = ?').run(datasetId);
  db.prepare('DELETE FROM fairness_review_queue WHERE dataset_id = ?').run(datasetId);
}

// ───────────────────────────────────────────────────────────
// Test 7: Edge Cases
// ───────────────────────────────────────────────────────────
function testEdgeCases() {
  console.log('\n⚠️  Test 7: Edge Cases');

  // Empty groups
  const emptyMetrics = computeAllMetrics([], {
    column_mappings: { target_outcome: 'a', predicted_outcome: 'b' },
    protected_attributes: [{ column: 'g', reference_group: 'x' }],
  });
  assert(emptyMetrics.total_records === 0, 'Handles empty dataset');

  // All same outcome
  const sameRows = Array.from({ length: 50 }, (_, i) => ({
    id: i, group: i < 25 ? 'A' : 'B', actual: 1, predicted: 1, ts: '2024-01-01', ver: 'v1',
  }));
  const sameConfig = {
    dataset_name: 'All Positive',
    column_mappings: { record_id: 'id', target_outcome: 'actual', predicted_outcome: 'predicted', timestamp: 'ts', model_version: 'ver' },
    protected_attributes: [{ column: 'group', reference_group: 'A' }],
  };
  const sameMetrics = computeAllMetrics(sameRows, sameConfig);
  const sameSPD = sameMetrics.per_attribute.group.fairness_metrics['B'].statistical_parity_difference;
  assert(sameSPD === 0, 'SPD = 0 when all outcomes identical');

  const sameDIR = sameMetrics.per_attribute.group.fairness_metrics['B'].disparate_impact_ratio;
  assert(sameDIR === 1, 'DIR = 1 when selection rates equal');

  // Single group (no comparison possible)
  const singleRows = Array.from({ length: 10 }, (_, i) => ({
    id: i, group: 'A', actual: i % 2, predicted: i % 2, ts: '2024-01-01', ver: 'v1',
  }));
  const singleConfig = { ...sameConfig, protected_attributes: [{ column: 'group', reference_group: 'A' }] };
  const singleMetrics = computeAllMetrics(singleRows, singleConfig);
  assert(Object.keys(singleMetrics.per_attribute.group.fairness_metrics).length === 0,
    'No fairness metrics when only reference group exists');
}

// ───────────────────────────────────────────────────────────
// RUN ALL TESTS
// ───────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════');
console.log('  Fairness Auditing System — Test Suite');
console.log('═══════════════════════════════════════════════════');

try {
  testMathHelpers();
  testCSVParser();
  testValidation();
  testFairnessMetrics();
  testProfiler();
  testAuditService();
  testEdgeCases();
} catch (err) {
  console.error('\n💥 UNEXPECTED ERROR:', err);
  failed++;
}

console.log('\n═══════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════\n');

closeDb();
process.exit(failed > 0 ? 1 : 0);
