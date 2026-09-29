import { ProcessingQueue } from './processing-queue';

class Busy extends Error {}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('ProcessingQueue', () => {
  it('procesa de a uno, acepta 3 en espera y rechaza el siguiente', async () => {
    const q = new ProcessingQueue(1, 3, () => new Busy());
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const order: number[] = [];
    let running = 0;
    let maxRunning = 0;
    const jobs = gates.map((g, i) =>
      q.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        order.push(i);
        await g.promise;
        running--;
        return i;
      }),
    );
    expect(q.size).toEqual({ active: 1, waiting: 3 });
    await expect(q.run(async () => 99)).rejects.toBeInstanceOf(Busy);

    for (const g of gates) g.resolve();
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3]);
    expect(order).toEqual([0, 1, 2, 3]);
    expect(maxRunning).toBe(1);
    expect(q.size).toEqual({ active: 0, waiting: 0 });
  });

  it('un error no bloquea la fila', async () => {
    const q = new ProcessingQueue(1, 3, () => new Busy());
    await expect(q.run(async () => Promise.reject(new Error('falló')))).rejects.toThrow('falló');
    await expect(q.run(async () => 'ok')).resolves.toBe('ok');
    expect(q.size).toEqual({ active: 0, waiting: 0 });
  });
});
