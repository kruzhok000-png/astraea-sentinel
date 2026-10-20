import { expect, it } from 'vitest';
import { serialized } from '../src/services/serial.js';
it('serializes a single application and releases its lock after failure', async () => {
  const order: number[] = [];
  const first = serialized('app', async () => { order.push(1); throw new Error('retryable'); });
  const second = serialized('app', async () => { order.push(2); return 'ok'; });
  await expect(first).rejects.toThrow('retryable');
  await expect(second).resolves.toBe('ok');
  expect(order).toEqual([1, 2]);
});
