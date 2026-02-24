import { Page } from '@playwright/test';

export const ARABIC = {
  hello:      'مرحبا',
  test:       'اختبار',
  note:       'ملاحظة للاختبار',
  equipment:  'معدات المصنع',
  inspection: 'فحص المعدات',
  report:     'تقرير اختبار',
  mixed:      'Test Note - ملاحظة مختلطة',
  search:     'بحث',
};

/** Switch language to Arabic using the login page language selector. */
export async function switchToArabic(page: Page): Promise<void> {
  const langSelect = page.locator('.ant-select').last();
  await langSelect.click();
  await page.getByText('العربية').click();
}

/** Fill Arabic text into an input/textarea. */
export async function fillArabic(page: Page, selector: string, text: string): Promise<void> {
  await page.locator(selector).fill(text);
}
