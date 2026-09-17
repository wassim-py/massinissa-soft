const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\wassi\\.gemini\\antigravity\\brain\\39996948-42fd-4db2-9179-98c87d04be6c';
const IMG_DIR = path.join(ARTIFACT_DIR, 'images');

if (!fs.existsSync(IMG_DIR)) {
  fs.mkdirSync(IMG_DIR, { recursive: true });
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function verifyDesignSystem() {
  console.log('=== Launching Chrome for Design System & Shell Verification ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();

    // Set dev test cookie so proxy middleware allows local test access
    await page.setCookie({
      name: 'x-dev-test',
      value: 'true',
      domain: 'localhost',
      path: '/',
    });

    // Breakpoint 1: 360px (Mobile)
    console.log('1. Capturing Shell at 360px (Mobile)...');
    await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/ar/list/teachers', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(IMG_DIR, 'teachers-360px.png'), fullPage: false });

    // Test Hamburger Menu click at 360px
    console.log('2. Opening Hamburger Menu at 360px...');
    const hamburgerBtn = await page.$('button[aria-label="فتح القائمة الرئيسية"]');
    if (hamburgerBtn) {
      await hamburgerBtn.click();
      await new Promise((r) => setTimeout(r, 600)); // wait for slide transition
      await page.screenshot({ path: path.join(IMG_DIR, 'hamburger-drawer-360px.png'), fullPage: false });
      
      // Close drawer again
      const closeBtn = await page.$('button[aria-label="إغلاق القائمة"]');
      if (closeBtn) {
        await closeBtn.click();
        await new Promise((r) => setTimeout(r, 400));
      }
    } else {
      console.log('Hamburger button not found by aria-label, searching button with Menu icon');
    }

    // Breakpoint 2: 768px (Tablet)
    console.log('3. Capturing Shell at 768px (Tablet)...');
    await page.setViewport({ width: 768, height: 1024, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/ar/list/teachers', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'teachers-768px.png'), fullPage: false });

    // Breakpoint 3: 1024px (Desktop)
    console.log('4. Capturing Shell at 1024px (Desktop)...');
    await page.setViewport({ width: 1024, height: 768, isMobile: false });
    await page.goto('http://localhost:3000/ar/list/teachers', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'teachers-1024px.png'), fullPage: false });

    // Breakpoint 4: 1440px (Wide Desktop)
    console.log('5. Capturing Shell at 1440px (Wide Desktop)...');
    await page.setViewport({ width: 1440, height: 900, isMobile: false });
    await page.goto('http://localhost:3000/ar/list/teachers', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'teachers-1440px.png'), fullPage: false });

    // Breakpoint 5: French LTR 360px (Mobile)
    console.log('6. Capturing French LTR at 360px (Mobile)...');
    await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/fr/list/teachers', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'teachers-fr-360px.png'), fullPage: false });

    // Breakpoint 6: Admin Dashboard 360px (Mobile) - Matching user screenshot
    console.log('8. Capturing Admin Dashboard at 360px...');
    await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/ar/admin', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'admin-360px.png'), fullPage: false });

    // Open Hamburger Menu on Admin Dashboard
    console.log('9. Opening Hamburger Menu on Admin Dashboard 360px...');
    const adminHamburger = await page.$('button[aria-label="فتح القائمة الرئيسية"]');
    if (adminHamburger) {
      await adminHamburger.click();
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: path.join(IMG_DIR, 'admin-drawer-360px.png'), fullPage: false });
    }

    // Breakpoint 7: Admin Dashboard Desktop (1280px) - Matching user screenshot
    console.log('10. Capturing Admin Dashboard on Desktop (1280px)...');
    await page.setViewport({ width: 1280, height: 800, isMobile: false });
    await page.goto('http://localhost:3000/ar/admin', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(IMG_DIR, 'admin-1280px.png'), fullPage: false });

    console.log('=== All responsive verification screenshots captured successfully! ===');
  } catch (err) {
    console.error('Verification error:', err);
  } finally {
    await browser.close();
  }
}

verifyDesignSystem();
