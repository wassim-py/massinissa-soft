const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\wassi\\.gemini\\antigravity\\brain\\df681aa7-7b79-4155-88e8-13824b44a8d9';
const IMG_DIR = path.join(ARTIFACT_DIR, 'images');

if (!fs.existsSync(IMG_DIR)) {
  fs.mkdirSync(IMG_DIR, { recursive: true });
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function captureDenseScreens() {
  console.log('=== Launching Chrome to capture dense screens at 360px and 390px ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();

    // 1. Payment Grid at 360px (Cards view)
    console.log('Capturing Payment Grid at 360px (Cards view)...');
    await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/ar/test-responsive?view=payment', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'payment-grid-cards-360.png'), fullPage: true });

    // 2. Payment Grid at 360px (Table view)
    console.log('Switching to table mode and capturing Payment Grid at 360px...');
    const tableBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.textContent.includes('جدول كامل'));
    });
    if (tableBtn && tableBtn.click) {
      await tableBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({ path: path.join(IMG_DIR, 'payment-grid-table-360.png'), fullPage: true });
    }

    // 3. Payment Grid at 390px (Cards view)
    console.log('Capturing Payment Grid at 390px (Cards view)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/ar/test-responsive?view=payment', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'payment-grid-cards-390.png'), fullPage: true });

    // 4. Attendance Roster at 360px
    console.log('Capturing Attendance Roster at 360px...');
    await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/ar/test-responsive?view=roster', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'attendance-roster-360.png'), fullPage: true });

    // 5. Attendance Roster at 390px
    console.log('Capturing Attendance Roster at 390px...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/ar/test-responsive?view=roster', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'attendance-roster-390.png'), fullPage: true });

    // 6. Attendance Grid at 360px
    console.log('Capturing Attendance Grid at 360px...');
    await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/ar/test-responsive?view=attendance-grid', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'attendance-grid-360.png'), fullPage: true });

    // 7. Timetable at 360px (Day agenda view)
    console.log('Capturing Timetable at 360px (Day agenda view)...');
    await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/ar/test-responsive?view=timetable', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'timetable-day-360.png'), fullPage: true });

    // 8. Timetable at 360px (Full week grid)
    console.log('Switching to week mode and capturing Timetable at 360px...');
    const weekBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.textContent.includes('أسبوعي كامل'));
    });
    if (weekBtn && weekBtn.click) {
      await weekBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({ path: path.join(IMG_DIR, 'timetable-week-360.png'), fullPage: true });
    }

    // 9. Timetable at 390px (Day agenda view)
    console.log('Capturing Timetable at 390px (Day agenda view)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/ar/test-responsive?view=timetable', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'timetable-day-390.png'), fullPage: true });

    console.log('All dense screen screenshots captured successfully!');
  } finally {
    await browser.close();
  }
}

captureDenseScreens().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
