import test from 'node:test';
import assert from 'node:assert/strict';
import { wasAnsweredOutside } from '../src/answered-outside.mjs';

test('detects a reply sent outside the CRM via a later status event', () => {
  const statusEvents = [
    { customer_wa_id: '5491100000001', occurred_at: '2026-09-03T16:10:00Z' },
  ];
  assert.equal(wasAnsweredOutside('2026-09-03T16:00:00Z', '5491100000001', statusEvents), true);
});

test('does not mark as answered when the status happened before the inbound message', () => {
  const statusEvents = [
    { customer_wa_id: '5491100000001', occurred_at: '2026-09-03T15:00:00Z' },
  ];
  assert.equal(wasAnsweredOutside('2026-09-03T16:00:00Z', '5491100000001', statusEvents), false);
});

test('ignores status events for a different contact', () => {
  const statusEvents = [
    { customer_wa_id: '5491100000002', occurred_at: '2026-09-03T16:10:00Z' },
  ];
  assert.equal(wasAnsweredOutside('2026-09-03T16:00:00Z', '5491100000001', statusEvents), false);
});

test('returns false with no wa_id or no inbound timestamp', () => {
  assert.equal(wasAnsweredOutside('', '5491100000001', []), false);
  assert.equal(wasAnsweredOutside('2026-09-03T16:00:00Z', '', []), false);
});
