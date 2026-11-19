import type { WebUiPanel } from 'cortico/web/shared/client-panel.ts';

export const webToolsPanel: WebUiPanel = {
  async mount(ctx) {
    const state = await ctx.invoke<{ groupId: string; fields: { path: string; title: string; checked: boolean }[] }>(
      'state', [{ name: ctx.scope.instance }],
    );
    if (ctx.signal.aborted) return;
    for (const field of state.fields) {
      const control = ctx.ui.checkbox(field.title, {
        checked: field.checked, onChange: checked => { void ctx.setConfig(state.groupId, { [field.path]: checked }); },
      });
      ctx.root.append(control.el);
    }
  },
};
