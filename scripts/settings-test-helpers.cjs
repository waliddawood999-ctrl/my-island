// Test setup for suites that inspect all advanced controls rather than disclosure defaults.
exports.expandSettings = async (page) => {
  await page.evaluate(() => document.querySelectorAll('details.st-advanced').forEach(e => { e.open = true; }));
  for (const button of await page.locator('.tp-mod-toggle[aria-expanded="false"]').all()) await button.click();
};
