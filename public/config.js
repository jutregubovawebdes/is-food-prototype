// A deterministic preview clock. Set fixedNow: null to test real time.
// Never use browser time as authoritative for orders or payments in production.
window.IS_FOOD_CONFIG = Object.freeze({
  fixedNow: '2026-10-20T12:00:00+05:00',
  timeZone: 'Asia/Yekaterinburg'
});
