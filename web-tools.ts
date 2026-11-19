import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import type { GenerateOptions } from 'cortico/core/generation.ts';
import { pick, type Language } from 'cortico/core/language.ts';
import type { LLMProviderEntry } from 'cortico/core/types.ts';
import type { Request, StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { ResponsesProvider, type ResponsesProviderOptions } from 'cortico/providers/openai-responses-compat/native.ts';
import { NativeResponseAssembly } from 'cortico/providers/transport/response-assembly.ts';

export function webToolsGroup(name: string, language: Language): ConfigGroup {
  const prefix = `providers.${name}.options`;
  return {
    id: `llm.deepseek.${name}.web-tools`, owner: 'provider:deepseek',
    schema: { type: 'object', title: pick(language, { zh: '联网工具', en: 'Web tools' }), properties: {
      [`${prefix}.webSearch.enabled`]: { type: 'boolean', title: pick(language, { zh: '联网搜索', en: 'Web search' }) },
      [`${prefix}.readUrl.enabled`]: { type: 'boolean', title: pick(language, { zh: '阅读链接', en: 'Read links' }) },
    } },
  };
}

export function enabledWebTools(entry: LLMProviderEntry): string[] {
  const options = entry.options as { webSearch?: { enabled?: boolean }; readUrl?: { enabled?: boolean } } | undefined;
  return [
    ...(options?.webSearch?.enabled === true ? ['deepseek_web_search'] : []),
    ...(options?.readUrl?.enabled === true ? ['deepseek_read_url'] : []),
  ];
}

class WebToolAssembly extends NativeResponseAssembly {
  override feed(payload: unknown, emit: (event: StreamEvent) => void): void {
    // The final output_item.done contains the sources, page and replay signature.
    const { type } = payload as { type?: string } ?? {};
    if (type === 'response.web_search_call.in_progress' || type === 'response.web_search_call.searching'
      || type === 'response.web_search_call.completed') return;
    super.feed(payload, emit);
  }
}

export class DeepSeekResponsesProvider extends ResponsesProvider {
  constructor(options: ResponsesProviderOptions, private readonly webTools: string[]) {
    super(options);
  }

  protected override buildResponseBody(request: Request, options: GenerateOptions) {
    const body = super.buildResponseBody(request, options);
    const tools = (body.tools ?? []) as { type: string }[];
    const format = (body.text as { format?: { type: string } } | undefined)?.format;
    // Chatbot tools only support plain text and may relax a forced tool choice.
    if (body.model === 'deepseek-flash' && (!body.tool_choice || body.tool_choice === 'auto')
      && (!format || format.type === 'text') && tools.every(tool => tool.type === 'function' || this.webTools.includes(tool.type))) {
      body.tools = [...tools, ...this.webTools.filter(type => !tools.some(tool => tool.type === type)).map(type => ({ type }))];
    }
    return body;
  }

  protected override responseAssembly() { return new WebToolAssembly(); }
}
