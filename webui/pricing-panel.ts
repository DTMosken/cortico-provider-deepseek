import type { WebUiPanel, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
import { pick } from 'cortico/core/language.ts';
import { currentPricingBand, type DeepSeekPricingSchedule } from '../pricing.ts';
import type { PriceDefinition } from 'cortico/providers/pricebook.ts';

interface PricingState {
  name: string;
  schedule: DeepSeekPricingSchedule;
  band: 'peak' | 'offPeak';
  official: PriceDefinition;
}

interface PricingInstance { name: string }

export const pricingPanel: WebUiPanel = {
  mount: async (ctx: WebUiPanelContext) => {
    const S = pick(ctx.language, { zh: {
      title: 'DeepSeek 官方价目', current: '当前计价档位', peak: '高峰', offPeak: '空闲', model: '模型',
      meter: '用量', cached: '输入（缓存命中）', uncached: '输入（缓存未命中）', output: '输出',
      choose: 'DeepSeek 端点',
      loadError: '无法读取价目', noInstances: '没有可用的 DeepSeek 端点',
    }, en: {
      title: 'DeepSeek official rates', current: 'Active pricing band', peak: 'Peak', offPeak: 'Off-peak', model: 'Model',
      meter: 'Usage', cached: 'Input (cache hit)', uncached: 'Input (cache miss)', output: 'Output',
      choose: 'DeepSeek endpoint',
      loadError: 'Unable to load rates', noInstances: 'No DeepSeek endpoints are available',
    } });
    const message = ctx.ui.msgline();
    const selector = ctx.scope.instance ? null : ctx.ui.select({
      options: [],
      onChange: (name) => void load(name),
    });
    if (selector) ctx.root.append(ctx.ui.field(S.choose, selector));
    ctx.root.append(message);
    let currentCard: HTMLElement | null = null;

    let endpointNames: string[] = [];
    if (ctx.scope.instance) {
      endpointNames = [ctx.scope.instance];
    } else {
      try {
        const instances = await ctx.invoke<PricingInstance[]>('instances');
        endpointNames = instances.map(({ name }) => name);
      } catch (error) {
        message.textContent = `${S.loadError}: ${String(error)}`;
        return;
      }
      if (!endpointNames.length) {
        message.textContent = S.noInstances;
        return;
      }
      selector!.replaceChildren(...endpointNames.map((name) => {
        const option = ctx.ui.h('option', null, name) as HTMLOptionElement;
        option.value = name;
        return option;
      }));
    }
    if (ctx.signal.aborted) return;
    await load(endpointNames[0]);

    async function load(name: string): Promise<void> {
      try {
        const state = await ctx.invoke<PricingState>('state', [{ name }]);
        if (ctx.signal.aborted) return;
        render(state);
        message.textContent = '';
      } catch (error) {
        message.textContent = `${S.loadError}: ${String(error)}`;
      }
    }

    function render(state: PricingState): void {
      const card = ctx.ui.sheet({ title: S.title });
      const band = currentPricingBand(state.schedule, new Date());
      card.body.append(ctx.ui.statgrid([
        { k: S.model, v: state.official.models.join(', ') },
        { k: S.current, v: band === 'peak' ? S.peak : S.offPeak, accent: true },
      ]));
      const table = ctx.ui.table({ head: [S.meter, S.peak, S.offPeak] });
      const peakRules = state.official.timeWindows?.[0]?.rules ?? [];
      const labels = new Map([
        ['cachedInput', S.cached], ['uncachedInput', S.uncached], ['output', S.output],
      ]);
      for (const rule of state.official.rules) {
        const peak = peakRules.find((item) => item.meter === rule.meter)?.perMillion ?? rule.perMillion;
        const format = (rate: number) => `¥${rate.toFixed(2)} / 1M`;
        table.addRow([
          labels.get(rule.meter) ?? rule.meter,
          band === 'peak' ? ctx.ui.chip(format(peak), 'accent') : format(peak),
          band === 'offPeak' ? ctx.ui.chip(format(rule.perMillion), 'accent') : format(rule.perMillion),
        ]);
      }
      card.body.append(table.el, ctx.ui.msgline(`${state.official.source} · Asia/Shanghai`));

      if (currentCard) currentCard.replaceWith(card.el);
      else ctx.root.insertBefore(card.el, message);
      currentCard = card.el;

    }
  },
};
