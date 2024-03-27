import RequestQueue from 'src/core/RequestQueue';

describe('RequestQueue', () => {
    describe('progress & loading', () => {
        it('progress should return the ratio between enqueued tasks and executed tasks', async () => {
            const queue = new RequestQueue({ maxConcurrentRequests: 1 });

            expect(queue.loading).toEqual(false);
            expect(queue.progress).toEqual(1);

            let executedTasks = 0;
            const totalTasks = 30;

            queue.addEventListener('task-executed', () => {
                executedTasks++;
            });

            for (let i = 0; i < totalTasks; i++) {
                queue.enqueue({
                    id: `${i}`,
                    request: () => Promise.resolve(),
                });
            }

            while (executedTasks < totalTasks) {
                expect(queue.loading).toEqual(true);
                expect(queue.progress).toBeCloseTo(executedTasks / totalTasks, 1);
                // eslint-disable-next-line no-await-in-loop
                await null;
            }

            expect(queue.progress).toEqual(1);
            expect(queue.loading).toEqual(false);
        });
    });

    describe('enqueue', () => {
        it('should return a rejected promise if the shouldExecute() function returned false', async () => {
            const queue = new RequestQueue({ maxConcurrentRequests: 1 });

            await expect(
                queue.enqueue({
                    id: 'foo',
                    request: () => Promise.resolve(),
                    shouldExecute: () => false,
                }),
            ).rejects.toEqual(new Error('aborted'));
        });

        it('should return a rejected promise if the signal was aborted', async () => {
            const queue = new RequestQueue({ maxConcurrentRequests: 1 });

            const controller = new AbortController();
            controller.abort();

            await expect(
                queue.enqueue({
                    id: 'foo',
                    signal: controller.signal,
                    request: () => Promise.resolve(),
                }),
            ).rejects.toEqual(new Error('aborted'));
        });

        it('should return an existing promise for the same id', async () => {
            const queue = new RequestQueue({ maxConcurrentRequests: 1 });

            const id = 'uniqueId';

            const promise1 = queue.enqueue({ id, request: () => Promise.resolve() });
            const promise2 = queue.enqueue({ id, request: () => Promise.resolve() });
            const promise3 = queue.enqueue({ id, request: () => Promise.resolve() });

            await promise1;
            await promise2;
            await promise3;

            expect(promise1).toBe(promise2);
            expect(promise1).toBe(promise3);
        });

        it('should infer the return type of the promise', async () => {
            const queue = new RequestQueue({ maxConcurrentRequests: 1 });

            const id = 'uniqueId';

            const request = () => Promise.resolve(1);

            const promise1: Promise<number> = queue.enqueue({ id, request });

            const result = await promise1;

            expect(result).toEqual(1);
        });
    });
});
