// ═══════════════════════════════════════════════════════════
// LLM Provider Service — abstraction for Gemini/Gemma models
//
// This keeps model-provider selection centralized and allows
// safe fallback behavior when API keys or models are missing.
// ═══════════════════════════════════════════════════════════

const PROVIDER_GEMINI = 'gemini';
const PROVIDER_GEMMA = 'gemma';

const DEFAULT_MODELS = {
  [PROVIDER_GEMINI]: process.env.LLM_MODEL_GEMINI || 'gemini-2.5-flash',
  [PROVIDER_GEMMA]: process.env.LLM_MODEL_GEMMA || 'gemma-3-27b-it',
};

const modelCache = new Map();

function normalizeProvider(input) {
  const provider = String(input || process.env.LLM_PROVIDER || PROVIDER_GEMINI).toLowerCase();
  if (provider === PROVIDER_GEMMA) return PROVIDER_GEMMA;
  return PROVIDER_GEMINI;
}

function getConfiguredApiKey() {
  return process.env.GEMINI_API_KEY || '';
}

function isApiKeyConfigured() {
  const key = getConfiguredApiKey();
  return typeof key === 'string' && key.length > 10;
}

function stripCodeFences(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function getLlmProviderStatus() {
  const provider = normalizeProvider();
  return {
    provider,
    active_model: DEFAULT_MODELS[provider],
    models: { ...DEFAULT_MODELS },
    api_key_configured: isApiKeyConfigured(),
  };
}

async function getModel(providerInput) {
  const provider = normalizeProvider(providerInput);
  const modelName = DEFAULT_MODELS[provider];

  if (!isApiKeyConfigured()) {
    return null;
  }

  const cacheKey = `${provider}:${modelName}`;
  if (modelCache.has(cacheKey)) {
    return modelCache.get(cacheKey);
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(getConfiguredApiKey());
    const model = client.getGenerativeModel({ model: modelName });
    modelCache.set(cacheKey, model);
    console.log(`[LLM] ✓ Initialized ${provider} model: ${modelName}`);
    return model;
  } catch (err) {
    console.warn(`[LLM] Could not initialize ${provider} model ${modelName}:`, err.message);
    return null;
  }
}

export async function generateText({ prompt, provider, temperature = 0.2, maxOutputTokens = 700 }) {
  const activeProvider = normalizeProvider(provider);
  const model = await getModel(activeProvider);
  if (!model) {
    return {
      ok: false,
      provider: activeProvider,
      model: DEFAULT_MODELS[activeProvider],
      error: 'LLM model unavailable',
    };
  }

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    });

    const text = result.response.text().trim();
    return {
      ok: true,
      provider: activeProvider,
      model: DEFAULT_MODELS[activeProvider],
      text,
    };
  } catch (err) {
    return {
      ok: false,
      provider: activeProvider,
      model: DEFAULT_MODELS[activeProvider],
      error: err.message,
    };
  }
}

export async function generateJson({ prompt, provider, temperature = 0.1, maxOutputTokens = 700 }) {
  const response = await generateText({ prompt, provider, temperature, maxOutputTokens });
  if (!response.ok) return response;

  try {
    const parsed = JSON.parse(stripCodeFences(response.text));
    return {
      ...response,
      json: parsed,
    };
  } catch (err) {
    return {
      ok: false,
      provider: response.provider,
      model: response.model,
      error: `Invalid JSON response: ${err.message}`,
      text: response.text,
    };
  }
}
