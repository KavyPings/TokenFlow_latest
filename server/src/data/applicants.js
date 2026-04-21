// ═══════════════════════════════════════════════════════════
// Seed Applicant Profiles
// Used by demo scenarios to make workflows feel real and human.
// Each profile is a realistic loan applicant with risk characteristics.
// ═══════════════════════════════════════════════════════════

export const APPLICANTS = {
  'APP-001': {
    id: 'APP-001',
    name: 'Maya Patel',
    age: 34,
    email: 'maya.patel@example.com',
    zip: '10001',
    state: 'NY',
    employment_status: 'employed',
    employer: 'Meridian Tech Inc.',
    employment_years: 6,
    annual_income: 94000,
    monthly_income: 7833,
    monthly_debt: 1240,
    loan_amount: 35000,
    loan_purpose: 'home improvement',
    credit_history_years: 9,
    protected_attributes: { gender: 'F', race: 'South Asian', age_group: '30-39' },
    avatar_seed: 'Maya',
  },

  'APP-002': {
    id: 'APP-002',
    name: 'James Okafor',
    age: 28,
    email: 'james.okafor@example.com',
    zip: '60601',
    state: 'IL',
    employment_status: 'self_employed',
    employer: 'Self (Freelance)',
    employment_years: 3,
    annual_income: 56000,
    monthly_income: 4667,
    monthly_debt: 890,
    loan_amount: 15000,
    loan_purpose: 'business expansion',
    credit_history_years: 4,
    protected_attributes: { gender: 'M', race: 'Black', age_group: '25-34' },
    avatar_seed: 'James',
  },

  'APP-003': {
    id: 'APP-003',
    name: 'Elena Rodriguez',
    age: 52,
    email: 'e.rodriguez@example.com',
    zip: '90210',
    state: 'CA',
    employment_status: 'employed',
    employer: 'LA Unified School District',
    employment_years: 18,
    annual_income: 72000,
    monthly_income: 6000,
    monthly_debt: 980,
    loan_amount: 28000,
    loan_purpose: 'education',
    credit_history_years: 22,
    protected_attributes: { gender: 'F', race: 'Hispanic', age_group: '50-59' },
    avatar_seed: 'Elena',
  },

  'APP-004': {
    id: 'APP-004',
    name: 'David Chen',
    age: 41,
    email: 'd.chen@example.com',
    zip: '98101',
    state: 'WA',
    employment_status: 'employed',
    employer: 'Cascade Financial Services',
    employment_years: 12,
    annual_income: 138000,
    monthly_income: 11500,
    monthly_debt: 2100,
    loan_amount: 75000,
    loan_purpose: 'real estate',
    credit_history_years: 15,
    protected_attributes: { gender: 'M', race: 'East Asian', age_group: '40-49' },
    avatar_seed: 'DavidC',
  },

  'APP-005': {
    id: 'APP-005',
    name: 'Aisha Johnson',
    age: 23,
    email: 'aisha.j@example.com',
    zip: '30301',
    state: 'GA',
    employment_status: 'employed',
    employer: 'Walmart Distribution',
    employment_years: 1,
    annual_income: 38000,
    monthly_income: 3167,
    monthly_debt: 480,
    loan_amount: 8000,
    loan_purpose: 'auto',
    credit_history_years: 1,
    protected_attributes: { gender: 'F', race: 'Black', age_group: '18-24' },
    avatar_seed: 'Aisha',
  },
};

export const APPLICANT_LIST = Object.values(APPLICANTS);

export function getApplicant(id) {
  return APPLICANTS[id] || null;
}

export function getRandomApplicant() {
  const keys = Object.keys(APPLICANTS);
  return APPLICANTS[keys[Math.floor(Math.random() * keys.length)]];
}
