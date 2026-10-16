import { describe, expect, it } from 'vitest';
import type { ProviderWebUiHost } from 'cortico/providers/webui/types.ts';
import type { LLMProviderEntry } from 'cortico/core/types.ts';
import deepseekProvider from '../index.ts';
import { languageOfLocale, type Language } from 'cortico/core/language.ts';

const JSDOM_MODULE = new URL('../../Cortico/node_modules/jsdom/lib/api.js', import.meta.url).href;
const UI_MODULE = '../../Cortico/src/web/client/ui/index.ts';
const PRICING_MODULE = '../webui/pricing-panel.ts';
const SCHEDULE_MODULE = '../webui/schedule-panel.ts';
const { JSDOM } = await import(JSDOM_MODULE) as {
  JSDOM: new (html: string, options: { url: string }) => { window: { document: any; AbortController: typeof AbortController } };
};
const { createWebUi } = await import(UI_MODULE);
const { pricingPanel } = await import(PRICING_MODULE);
const { schedulePanel } = await import(SCHEDULE_MODULE);

function panelContext(panelId: 'pricing' | 'schedule', language: Language = 'zh') {
  const { window } = new JSDOM('<!doctype html><body><div class="connection-step"></div></body>', { url: 'http://localhost' });
  const controller = new window.AbortController();
  const root = window.document.querySelector('.connection-step');
  const entry: LLMProviderEntry = { kind: 'deepseek', baseUrl: 'https://api.deepseek.com' };
  const host: ProviderWebUiHost = {
    language, editing: true,
    entries: () => [{ name: 'main', entry }],
    instance: () => ({ client: {} as never }),
    save: () => {},
  };
  const contribution = deepseekProvider.webUi!(host);
  const ui = createWebUi({
    doc: window.document, overlayHost: window.document.body, signal: controller.signal,
    memo: { get: <T>(_key: string, fallback: T): T => fallback, set: () => {} },
  });
  return {
    panelId, root, ui, signal: controller.signal, language, scope: { instance: 'main' },
    invoke: (method: string, args?: unknown[]) => Promise.resolve(contribution.invoke!(panelId, method, args ?? [])),
    interval: () => ({ dispose() {} }),
  };
}

describe('DeepSeek connection panels', () => {
  it.each([
    ['zh-Hant', 'DeepSeek 官方价目', '当前计价时段', '时段 1'],
    ['en', 'DeepSeek official rates', 'Active pricing band', 'Window 1'],
    ['ja', 'DeepSeek official rates', 'Active pricing band', 'Window 1'],
  ])('renders %s through its Chinese or English fallback', async (locale, pricingTitle, scheduleTitle, windowLabel) => {
    const pricing = panelContext('pricing', languageOfLocale(locale)!);
    await pricingPanel.mount(pricing);
    expect(pricing.root.textContent).toContain(pricingTitle);
    const schedule = panelContext('schedule', languageOfLocale(locale)!);
    await schedulePanel.mount(schedule);
    expect(schedule.root.textContent).toContain(scheduleTitle);
    expect(schedule.root.textContent).toContain(windowLabel);
  });
  it('shows the collapsed endpoint quote editor inside the official pricing card', async () => {
    const ctx = panelContext('pricing');
    await pricingPanel.mount(ctx);
    const custom = ctx.root.querySelector('details.deepseek-custom-pricing');
    expect(custom).not.toBeNull();
    expect(custom?.open).toBe(false);
    expect(custom?.textContent).toContain('端点自定义报价');
    expect(custom?.querySelectorAll('input[type="number"]')).toHaveLength(3);
  });

  it('keeps the schedule in one foldable step with both windows on one row', async () => {
    const ctx = panelContext('schedule');
    await schedulePanel.mount(ctx);
    expect(Array.from(ctx.root.children).filter((element: any) => element.classList.contains('sheet'))).toHaveLength(1);
    const card = ctx.root.querySelector(':scope > details.sheet.fold');
    expect(card).not.toBeNull();
    expect(card?.open).toBe(false);
    expect(card?.querySelector('.tablewrap')).toBeNull();
    const windows = card?.querySelectorAll('.deepseek-window-grid > .deepseek-window');
    expect(windows).toHaveLength(2);
    for (const window of windows ?? []) expect(window.querySelectorAll('input')).toHaveLength(2);
  });
});
