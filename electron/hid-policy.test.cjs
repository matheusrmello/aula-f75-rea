const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAppOrigin, isAulaDevice, hasConfigReport } = require('./hid-policy.cjs');

test('accepts both Electron forms of the application origin', () => {
  assert.equal(isAppOrigin('aula://app'), true);
  assert.equal(isAppOrigin('aula://app/'), true);
});

test('rejects other origins and malformed URLs', () => {
  for (const origin of ['https://app', 'aula://other/', 'aula://app.evil/', 'aula://app:123/', 'aula://user@app/', 'null', undefined]) {
    assert.equal(isAppOrigin(origin), false, String(origin));
  }
});

test('allows only the exact supported VID/PID pairs', () => {
  assert.equal(isAulaDevice({ vendorId: 0x258a, productId: 0x010c }), true);
  assert.equal(isAulaDevice({ vendorId: 0x3554, productId: 0xfa09 }), true);
  assert.equal(isAulaDevice({ vendorId: 0x258a, productId: 0xfa09 }), false);
  assert.equal(isAulaDevice({ vendorId: 0x1111, productId: 0x010c }), false);
});

test('requires the configuration report for each transport', () => {
  const wired = { vendorId: 0x258a, productId: 0x010c, collections: [{ featureReports: [{ reportId: 6 }] }] };
  const dongle = { vendorId: 0x3554, productId: 0xfa09, collections: [{ outputReports: [{ reportId: 19 }] }] };
  assert.equal(hasConfigReport(wired), true);
  assert.equal(hasConfigReport(dongle), true);
  assert.equal(hasConfigReport({ ...dongle, collections: wired.collections }), false);
  assert.equal(hasConfigReport({ ...wired, collections: [] }), false);
  assert.equal(hasConfigReport({ ...wired, collections: [{ children: wired.collections }] }), true);
});
