import test from 'node:test';
import assert from 'node:assert/strict';
import { facingYawForDirection } from '../src/movement.mjs';

test('astronaut authored toward negative Z faces forward travel instead of backwards', () => {
  assert.equal(facingYawForDirection(0, -1), 0);
  assert.equal(facingYawForDirection(1, 0), -Math.PI / 2);
  assert.equal(facingYawForDirection(-1, 0), Math.PI / 2);
});
