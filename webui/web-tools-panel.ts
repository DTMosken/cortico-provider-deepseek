import type { WebUiPanel } from 'cortico/web/shared/client-panel.ts';

export const webToolsPanel: WebUiPanel = {
  async mount(ctx) {
    const state = await ctx.invoke<{ groupId: string; fields: { path: string; title: string; checked: boolean }[] }>(
      'state', [{ name: ctx.scope.instance }],
    );
    if (ctx.signal.aborted) return;
    const group = ctx.ui.h('div', 'deepseek-web-tools');
    for (const field of state.fields) {
      const row = ctx.ui.h('label');
      const toggle = ctx.ui.h('input', 'connection-switch');
      toggle.type = 'checkbox';
      toggle.setAttribute('role', 'switch');
      toggle.checked = field.checked;
      toggle.addEventListener('change', () => void ctx.setConfig(state.groupId, { [field.path]: toggle.checked }), { signal: ctx.signal });
      row.append(ctx.ui.h('span', undefined, field.title), toggle);
      group.append(row);
    }
    ctx.root.append(group);
  },
};
