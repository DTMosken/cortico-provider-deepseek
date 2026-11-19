import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { createResponse, type Request } from 'cortico/protocol/open-responses/index.ts';
import { inputItem, record } from 'cortico/protocol/open-responses/context.ts';
import { nullLogger } from 'cortico/core/util.ts';
import provider from '../index.ts';

const lookup = { type: 'function' as const, name: 'local_lookup', description: 'Look up a record.', parameters: { type: 'object' } };
const signedPage = {
  type: 'web_search_call', id: 'page1', kind: 'read_link', status: 'completed',
  action: { type: 'open_page', url: 'https://example.org' },
  page: { url: 'https://example.org', title: 'Example' }, signature: 'page-signature',
};
const localCall = { type: 'function_call', id: 'fc1', call_id: 'call1', status: 'completed', name: lookup.name, arguments: '{}' };

it('keeps endpoint switches independent and replays signed pages alongside local function calls', async () => {
  const bodies: Request[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const response = createResponse('reply', body);
    if (!body.stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...response, status: 'completed', output: [] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    let sequence = 0;
    const emit = (type: string, fields: object) => res.write(`data: ${JSON.stringify({ type, sequence_number: sequence++, ...fields })}\n\n`);
    emit('response.created', { response });
    emit('response.output_item.added', { output_index: 0, item: { ...signedPage, status: 'in_progress', signature: undefined } });
    for (const step of ['in_progress', 'searching', 'completed']) {
      emit(`response.web_search_call.${step}`, { output_index: 0, item_id: signedPage.id });
    }
    emit('response.output_item.done', { output_index: 0, item: signedPage });
    emit('response.output_item.added', { output_index: 1, item: { ...localCall, status: 'in_progress', arguments: '' } });
    emit('response.function_call_arguments.delta', { output_index: 1, item_id: localCall.id, delta: '{}' });
    emit('response.function_call_arguments.done', { output_index: 1, item_id: localCall.id, arguments: '{}' });
    emit('response.output_item.done', { output_index: 1, item: localCall });
    emit('response.completed', { response: { ...response, status: 'completed', output: [signedPage, localCall] } });
    res.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const connect = (options: Record<string, unknown>) => provider.create('test', {
      kind: 'deepseek', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, options,
    }, { stateDir: '', secret: () => '', readBlob: () => null, keepThinking: () => false, log: nullLogger() }).client;
    const request: Request = { model: 'deepseek-flash', input: 'Read https://example.org', tools: [lookup] };
    for (const [options, types] of [
      [{}, []],
      [{ webSearch: { enabled: true } }, ['deepseek_web_search']],
      [{ readUrl: { enabled: true } }, ['deepseek_read_url']],
    ] as const) {
      await connect(options).respond(request, { diagnostic: true });
      expect(bodies.at(-1)?.tools).toEqual([lookup, ...types.map(type => ({ type }))]);
    }
    const client = connect({ readUrl: { enabled: true }, webSearch: { enabled: true } });
    const result = await client.respond(request, { onEvent() {}, diagnostic: true });
    expect(bodies.at(-1)?.tools).toEqual([lookup, { type: 'deepseek_web_search' }, { type: 'deepseek_read_url' }]);
    expect(result.response.output).toEqual([signedPage, localCall]);
    await client.respond({ ...request, input: [...result.response.output.map(item => inputItem(record(item))),
      { type: 'function_call_output', call_id: localCall.call_id, output: 'found' }], tool_choice: 'required' }, { diagnostic: true });
    expect(bodies.at(-1)?.input).toContainEqual(signedPage);
    expect(bodies.at(-1)?.tools).toEqual([lookup]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
