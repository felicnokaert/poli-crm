import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCard } from '../src/board-model.mjs';

test('moves a card to the end of another list', () => {
  const cards = [
    { id: 'a', listId: 'list1', order: 0 },
    { id: 'b', listId: 'list2', order: 0 },
  ];
  const result = moveCard(cards, 'a', 'list2', null);
  const list2 = result.filter((item) => item.listId === 'list2').sort((x, y) => x.order - y.order);
  assert.deepEqual(list2.map((item) => item.id), ['b', 'a']);
});

test('inserts a card before another card in the target list', () => {
  const cards = [
    { id: 'a', listId: 'list1', order: 0 },
    { id: 'b', listId: 'list2', order: 0 },
    { id: 'c', listId: 'list2', order: 1 },
  ];
  const result = moveCard(cards, 'a', 'list2', 'c');
  const list2 = result.filter((item) => item.listId === 'list2').sort((x, y) => x.order - y.order);
  assert.deepEqual(list2.map((item) => item.id), ['b', 'a', 'c']);
});

test('reorders within the same list', () => {
  const cards = [
    { id: 'a', listId: 'list1', order: 0 },
    { id: 'b', listId: 'list1', order: 1 },
    { id: 'c', listId: 'list1', order: 2 },
  ];
  const result = moveCard(cards, 'c', 'list1', 'a');
  const list1 = result.sort((x, y) => x.order - y.order);
  assert.deepEqual(list1.map((item) => item.id), ['c', 'a', 'b']);
});

test('renumbers orders without gaps after a move', () => {
  const cards = [
    { id: 'a', listId: 'list1', order: 5 },
    { id: 'b', listId: 'list1', order: 9 },
  ];
  const result = moveCard(cards, 'a', 'list1', null);
  const list1 = result.sort((x, y) => x.order - y.order);
  assert.deepEqual(list1.map((item) => item.order), [0, 1]);
});

test('does nothing when the card does not exist', () => {
  const cards = [{ id: 'a', listId: 'list1', order: 0 }];
  assert.deepEqual(moveCard(cards, 'missing', 'list1', null), cards);
});
