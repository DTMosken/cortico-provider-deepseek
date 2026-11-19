import type { ProviderModule } from 'cortico/providers/base.ts';
import type { ReasoningTier } from 'cortico/core/types.ts';
import { pick, type Language } from 'cortico/core/language.ts';
import responsesCompat, { compatOptions } from 'cortico/providers/openai-responses-compat/index.ts';
import { DeepSeekResponsesProvider, enabledWebTools, webToolsGroup } from './web-tools.ts';
import { normalizePricing, pricesForSchedule } from './pricing.ts';
import { deepseekPricingWebUi } from './webui/server.ts';

const DEFAULT_MODEL = 'deepseek-flash';
const LEGACY_EFFORTS: Record<string, string> = {
  minimal: 'low', medium: 'high', xhigh: 'high', ultra: 'max',
};

const reasoningTiers = (language: Language): ReasoningTier[] => {
  const labels = pick(language, {
    zh: { high: '高', none: '关闭', low: '低', max: '最大' },
    en: { high: 'High', none: 'Off', low: 'Low', max: 'Max' },
  });
  return [
    { id: 'none', label: labels.none, thinking: false },
    { id: 'low', label: labels.low, thinking: true, effort: 'low' },
    { id: 'high', label: labels.high, thinking: true, effort: 'high' },
    { id: 'max', label: labels.max, thinking: true, effort: 'max' },
  ];
};

export const DEEPSEEK_PROVIDER: ProviderModule = {
  ...responsesCompat,
  id: 'deepseek',
  title: 'DeepSeek（峰谷计价）',
  description: 'DeepSeek Responses API，支持峰谷计价与关闭、低、高、最大四档思考。',
  describe: { protocols: ['openai-responses'], auth: ['api-key'], local: false, input: ['text', 'image'] },
  defaultBaseUrl: 'https://api.deepseek.com',
  baseUrlSuggestions: ['https://api.deepseek.com'],
  webUi: deepseekPricingWebUi,
  config: (name, entry, language) => [...responsesCompat.config(name, entry, language), webToolsGroup(name, language)],
  create(name, entry, host) {
    const instance = responsesCompat.create(name, entry, host);
    const tools = enabledWebTools(entry);
    if (!tools.length) return instance;
    return { ...instance, client: new DeepSeekResponsesProvider({
      ...compatOptions(entry), baseUrl: entry.baseUrl,
      apiKey: entry.secret ? host.secret(entry.secret) : undefined,
      log: host.log, keepThinking: host.keepThinking,
      media: { enabled: () => entry.multimodal === true, read: host.readBlob },
    }, tools) };
  },
  reasoningTiers: reasoningTiers('zh'),
  localize: (language) => ({
    ...responsesCompat.localize?.(language),
    title: pick(language, { zh: 'DeepSeek（峰谷计价）', en: 'DeepSeek (peak/off-peak pricing)' }),
    description: pick(language, {
      zh: 'DeepSeek Responses API，支持峰谷计价与关闭、低、高、最大四档思考。',
      en: 'DeepSeek Responses API with peak/off-peak pricing and Off, Low, High and Max reasoning tiers.',
    }),
    reasoningTiers: reasoningTiers(language),
  }),
  normalize(entry) {
    const normalized = responsesCompat.normalize?.(entry) ?? structuredClone(entry);
    if (normalized.pricing) normalized.pricing = normalizePricing(normalized.pricing);
    if (!normalized.spec) return normalized;
    const spec = { ...normalized.spec };
    if (typeof spec.model !== 'string' || !spec.model.trim()) spec.model = DEFAULT_MODEL;
    if (spec.thinking) {
      const effort = spec.reasoningEffort?.trim();
      if (effort === 'none') {
        spec.thinking = false;
        delete spec.reasoningEffort;
      } else {
        spec.reasoningEffort = effort ? LEGACY_EFFORTS[effort] ?? effort : 'high';
      }
    }
    return { ...normalized, spec };
  },
  prices: (entry) => [pricesForSchedule(entry.options?.deepseekPricingSchedule)],
  validateEntry(entry) {
    pricesForSchedule(entry.options?.deepseekPricingSchedule);
  },
};

export default DEEPSEEK_PROVIDER;
