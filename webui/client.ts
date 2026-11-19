import type { WebUiClientBundle } from 'cortico/web/shared/client-panel.ts';
import compat from 'cortico/providers/openai-responses-compat/webui/client.ts';
import { pricingPanel } from './pricing-panel.ts';
import { schedulePanel } from './schedule-panel.ts';
import { webToolsPanel } from './web-tools-panel.ts';

export default {
  ...compat,
  panels: { ...compat.panels, schedule: schedulePanel, 'official-pricing': pricingPanel, 'web-tools': webToolsPanel },
} satisfies WebUiClientBundle;
