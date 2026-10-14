import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateConsultationCode, isShortConsultationCode, isConsultationCode } from '../src/services/consultationCodes.js';

test('issue exactly six unambiguous characters; recover six, eight and legacy codes without accepting other lengths', () => {
  for (let index = 0; index < 100; index++) assert.match(generateConsultationCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  for (const code of ['ABC234', 'ABC23L', 'ABCDEFGH']) {
    assert.equal(isShortConsultationCode(code), true);
    assert.equal(isConsultationCode(code), true);
  }
  const legacy = 'LP-1234567890ABCDEF1234';
  assert.equal(isConsultationCode(legacy), true);
  assert.equal(isShortConsultationCode(legacy), false);
  for (const code of ['', 'ABCDE', 'ABCDEFG', 'ABCDEFGHJ', 'ABC012', 'ABC23I', 'ABC23O', 'abcdef', ' ABC234', 'ABC234 ', 'LP-123456']) {
    assert.equal(isShortConsultationCode(code), false, code);
    assert.equal(isConsultationCode(code), false, code);
  }
});
