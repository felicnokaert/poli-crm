import assert from 'node:assert/strict';
import test from 'node:test';
import { withRetry, isRetryableHttpStatus } from '../lib/retry.mjs';

test('isRetryableHttpStatus flags transient statuses but not client errors', () => {
  assert.equal(isRetryableHttpStatus(500), true);
  assert.equal(isRetryableHttpStatus(503), true);
  assert.equal(isRetryableHttpStatus(429), true);
  assert.equal(isRetryableHttpStatus(401), false);
  assert.equal(isRetryableHttpStatus(403), false);
  assert.equal(isRetryableHttpStatus(400), false);
});

test('withRetry returns immediately on first-attempt success without waiting', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    return { ok: true, value: 'saved' };
  }, { baseDelayMs: 1 });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.value, 'saved');
});

test('withRetry retries a transient 503 and succeeds on the second attempt', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 503 };
    return { ok: true };
  }, { retries: 2, baseDelayMs: 1 });
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
});

test('withRetry retries a thrown network error (fetch failed) and recovers', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('fetch failed');
    return { ok: true };
  }, { retries: 2, baseDelayMs: 1 });
  assert.equal(calls, 3);
  assert.equal(result.ok, true);
});

test('withRetry never exceeds retries + 1 attempts and surfaces the last failure', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    return { ok: false, status: 500 };
  }, { retries: 2, baseDelayMs: 1 });
  assert.equal(calls, 3); // 1 intento inicial + 2 reintentos, nunca más
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
});

test('withRetry does not retry a non-retryable status like 401/403', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    return { ok: false, status: 401 };
  }, { retries: 2, baseDelayMs: 1 });
  assert.equal(calls, 1); // ni un reintento: reintentar un 401 fallaría igual
  assert.equal(result.ok, false);
});

test('withRetry does not retry a validation-style 400', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    return { ok: false, status: 400 };
  }, { retries: 2, baseDelayMs: 1 });
  assert.equal(calls, 1);
});

test('withRetry re-throws the last error when every attempt throws', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls += 1;
      throw new Error('boom');
    }, { retries: 1, baseDelayMs: 1 }),
    /boom/,
  );
  assert.equal(calls, 2);
});
