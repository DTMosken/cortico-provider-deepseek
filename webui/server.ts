import type { WebUiPageContribution } from 'cortico/web/shared/webui-protocol.ts';
import type { ProviderWebUiHost } from 'cortico/providers/webui/types.ts';
import type { LLMProviderEntry } from 'cortico/core/types.ts';
import responsesCompat from 'cortico/providers/openai-responses-compat/index.ts';
import { pick } from 'cortico/core/language.ts';
import { currentPricingBand, parsePricingSchedule, pricesForSchedule } from '../pricing.ts';
import { webToolsGroup } from '../web-tools.ts';
import { getByPath } from 'cortico/core/config-schema.ts';

function instanceName(args: unknown[], required: string): string {
  const raw = args[0];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof (raw as Record<string, unknown>).name !== 'string') throw new Error(required);
  return (raw as { name: string }).name;
}

export function deepseekPricingWebUi(host: ProviderWebUiHost): Partial<WebUiPageContribution> {
  const base = responsesCompat.webUi?.(host) ?? {};
  const labels = pick(host.language, {
    zh: { title: '峰谷计价', description: '查看人民币单价、当前时段并调整峰时段与例外日期。', pricing: 'DeepSeek 官方价目', required: '需要端点名', unknownMethod: '未知方法' },
    en: { title: 'Peak/off-peak pricing', description: 'View CNY rates, the active band, and edit peak hours and exception dates.', pricing: 'DeepSeek official rates', required: 'Endpoint name required', unknownMethod: 'Unknown method' },
  });
  const stateFor = (name: string, entry: LLMProviderEntry) => {
    const schedule = parsePricingSchedule(entry.options?.deepseekPricingSchedule);
    return { name, schedule, band: currentPricingBand(schedule, new Date()), official: pricesForSchedule(schedule) };
  };
  const panels = (base.panels ?? []).flatMap((panel) => panel.id === 'pricing'
    ? [{ id: 'web-tools', title: pick(host.language, { zh: '联网工具', en: 'Web tools' }) },
       { id: 'official-pricing', title: labels.pricing }, panel]
    : [panel]);
  return {
    ...base,
    config: [...(base.config ?? [])],
    panels: [
      ...panels,
      { id: 'schedule', title: labels.title, description: labels.description },
    ],
    invoke: async (panel, method, args) => {
      if (panel !== 'schedule' && panel !== 'official-pricing' && panel !== 'web-tools') return base.invoke?.(panel, method, args);
      if (panel === 'official-pricing' && method === 'instances') {
        return host.entries().map(({ name }) => ({ name }));
      }
      const name = instanceName(args, labels.required);
      const entry = host.entries().find((item) => item.name === name)?.entry;
      if (!entry) throw new Error(labels.required);
      if (panel === 'web-tools' && method === 'state') {
        const group = webToolsGroup(name, host.language);
        const fields = Object.entries(group.schema.properties).map(([path, property]) => ({
          path, title: property.title, checked: getByPath(entry.options ?? {}, path.slice(`providers.${name}.options.`.length)) === true,
        }));
        return { groupId: group.id, fields };
      }
      if (method === 'state') return stateFor(name, entry);
      if (panel === 'schedule' && method === 'save') {
        const raw = args[0] as Record<string, unknown>;
        const schedule = parsePricingSchedule(raw.schedule);
        const next = { ...entry, options: { ...entry.options, deepseekPricingSchedule: JSON.stringify(schedule) } };
        host.save(name, next);
        return stateFor(name, next);
      }
      throw new Error(labels.unknownMethod);
    },
  };
}
