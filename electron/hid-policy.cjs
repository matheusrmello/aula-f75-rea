const AULA_DEVICES = new Set(['258a:010c', '3554:fa09']);

function deviceKey(device) {
  return `${Number(device.vendorId).toString(16).padStart(4, '0')}:${Number(device.productId).toString(16).padStart(4, '0')}`;
}

function isAppOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'aula:' && url.host === 'app' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isAulaDevice(device) {
  return AULA_DEVICES.has(deviceKey(device));
}

function hasConfigReport(device) {
  if (!isAulaDevice(device)) return false;
  const wireless = deviceKey(device) === '3554:fa09';
  const reports = wireless ? 'outputReports' : 'featureReports';
  const reportId = wireless ? 0x13 : 0x06;
  const matches = collection => (collection[reports] || []).some(r => r.reportId === reportId)
    || (collection.children || []).some(matches);
  return (device.collections || []).some(matches);
}

module.exports = { deviceKey, isAppOrigin, isAulaDevice, hasConfigReport };
