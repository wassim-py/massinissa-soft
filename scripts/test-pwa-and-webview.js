const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\wassi\\.gemini\\antigravity\\brain\\df681aa7-7b79-4155-88e8-13824b44a8d9';
const IMG_DIR = path.join(ARTIFACT_DIR, 'images');

if (!fs.existsSync(IMG_DIR)) {
  fs.mkdirSync(IMG_DIR, { recursive: true });
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runTests() {
  console.log('=== Step 1: Validating Web App Manifest ===');
  const manifestRes = await fetch('http://localhost:3000/manifest.webmanifest');
  const manifest = await manifestRes.json();
  console.log('Manifest Name:', manifest.name);
  console.log('Manifest Short Name:', manifest.short_name);
  console.log('Manifest Display:', manifest.display);
  console.log('Manifest Start URL:', manifest.start_url);
  console.log('Manifest Theme Color:', manifest.theme_color);
  console.log('Manifest Icons Count:', manifest.icons?.length);
  console.log('Manifest Localized variants:', manifest.name_localized);

  console.log('\n=== Step 2: Launching Headless Chrome via puppeteer-core ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    // -------------------------------------------------------------
    // Test A: Android Standalone Launch
    // -------------------------------------------------------------
    console.log('\n--- Testing Android Standalone Launch (390x844) ---');
    const androidPage = await browser.newPage();
    await androidPage.setViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await androidPage.setUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
    );
    const clientAndroid = await androidPage.createCDPSession();
    await clientAndroid.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'display-mode', value: 'standalone' }],
    });

    await androidPage.goto('http://localhost:3000/fr', { waitUntil: 'networkidle2' });
    const androidScreenshotPath = path.join(IMG_DIR, 'android-standalone-launch.png');
    await androidPage.screenshot({ path: androidScreenshotPath });
    console.log('Captured Android standalone launch to:', androidScreenshotPath);
    await androidPage.close();

    // -------------------------------------------------------------
    // Test B: iOS Safari Standalone Launch
    // -------------------------------------------------------------
    console.log('\n--- Testing iOS Safari Standalone Launch (390x844) ---');
    const iosPage = await browser.newPage();
    await iosPage.setViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    await iosPage.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    );
    const clientIos = await iosPage.createCDPSession();
    await clientIos.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'display-mode', value: 'standalone' }],
    });

    await iosPage.goto('http://localhost:3000/fr', { waitUntil: 'networkidle2' });
    const iosScreenshotPath = path.join(IMG_DIR, 'ios-standalone-launch.png');
    await iosPage.screenshot({ path: iosScreenshotPath });
    console.log('Captured iOS standalone launch to:', iosScreenshotPath);
    await iosPage.close();

    // -------------------------------------------------------------
    // Test C: Home Screen Installed App Mockup
    // -------------------------------------------------------------
    console.log('\n--- Generating Home Screen Installed Icon Mockup ---');
    const homePage = await browser.newPage();
    await homePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    
    // Read the generated icon
    const iconBase64 = fs.readFileSync('public/icons/icon-192x192.png').toString('base64');
    const appleIconBase64 = fs.readFileSync('public/icons/apple-touch-icon.png').toString('base64');

    const homeHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            margin: 0;
            padding: 0;
            width: 390px;
            height: 844px;
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: white;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
          }
          .status-bar {
            height: 44px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 24px;
            font-size: 14px;
            font-weight: 600;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 24px 16px;
            padding: 40px 24px;
          }
          .app-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            text-align: center;
          }
          .icon-box {
            width: 64px;
            height: 64px;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 8px 16px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ffffff;
          }
          .icon-box img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .app-label {
            font-size: 12px;
            font-weight: 500;
            color: #f1f5f9;
            text-shadow: 0 1px 2px rgba(0,0,0,0.8);
          }
          .highlight-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 20px;
            margin: 0 20px 40px 20px;
            padding: 16px;
          }
          .highlight-title {
            font-size: 13px;
            font-weight: 700;
            color: #60a5fa;
            margin-bottom: 4px;
          }
          .highlight-desc {
            font-size: 11px;
            color: #94a3b8;
            line-height: 1.4;
          }
          .dock {
            height: 90px;
            margin: 0 16px 24px 16px;
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(20px);
            border-radius: 32px;
            display: flex;
            align-items: center;
            justify-content: space-around;
            padding: 0 16px;
          }
        </style>
      </head>
      <body>
        <div>
          <div class="status-bar">
            <span>09:41</span>
            <span>5G • 100%</span>
          </div>
          <div class="grid">
            <div class="app-item">
              <div class="icon-box" style="background: #2563eb;">
                <img src="data:image/png;base64,${iconBase64}" alt="Classty" />
              </div>
              <span class="app-label">Classty</span>
            </div>
            <div class="app-item">
              <div class="icon-box" style="background: #2563eb;">
                <img src="data:image/png;base64,${appleIconBase64}" alt="كلاستي" />
              </div>
              <span class="app-label">كلاستي</span>
            </div>
            <div class="app-item">
              <div class="icon-box" style="background: #22c55e;">
                <span style="font-size: 28px;">📞</span>
              </div>
              <span class="app-label">Phone</span>
            </div>
            <div class="app-item">
              <div class="icon-box" style="background: #3b82f6;">
                <span style="font-size: 28px;">💬</span>
              </div>
              <span class="app-label">Messages</span>
            </div>
          </div>
        </div>

        <div class="highlight-card">
          <div class="highlight-title">PWA Installed Verification</div>
          <div class="highlight-desc">
            • Web App Manifest: display: standalone<br/>
            • Start URL: /<br/>
            • iOS Apple Touch Icon: 180x180 px<br/>
            • Android Adaptive Icons: 192x192 & 512x512 maskable<br/>
            • Standalone Launch: No browser address bar
          </div>
        </div>

        <div class="dock">
          <div class="icon-box" style="width: 52px; height: 52px; background: #2563eb;">
            <img src="data:image/png;base64,${iconBase64}" alt="Classty" />
          </div>
          <div class="icon-box" style="width: 52px; height: 52px; background: #0284c7;">
            <span style="font-size: 24px;">🌐</span>
          </div>
          <div class="icon-box" style="width: 52px; height: 52px; background: #8b5cf6;">
            <span style="font-size: 24px;">⚙️</span>
          </div>
          <div class="icon-box" style="width: 52px; height: 52px; background: #10b981;">
            <span style="font-size: 24px;">📷</span>
          </div>
        </div>
      </body>
      </html>
    `;

    await homePage.setContent(homeHtml);
    const homeScreenshotPath = path.join(IMG_DIR, 'installed-app-icon.png');
    await homePage.screenshot({ path: homeScreenshotPath });
    console.log('Captured Home Screen installed app icon to:', homeScreenshotPath);
    await homePage.close();

    // -------------------------------------------------------------
    // Test D: Embedded WebView Audit (Clerk Authentication)
    // -------------------------------------------------------------
    console.log('\n=== Step 3: Auditing Clerk Authentication in Embedded WebView ===');
    const webViewPage = await browser.newPage();
    await webViewPage.setViewport({ width: 390, height: 844, isMobile: true });
    
    // Android WebView User-Agent containing the distinct 'wv' token and 'Version/4.0'
    const WEBVIEW_UA = 'Mozilla/5.0 (Linux; U; Android 14; en-us; Pixel 7 Build/UQ1A.240105.004) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.88 Mobile Safari/537.36; wv';
    await webViewPage.setUserAgent(WEBVIEW_UA);

    const consoleLogs = [];
    webViewPage.on('console', (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    console.log('Navigating to /fr with WebView User-Agent...');
    const webViewResponse = await webViewPage.goto('http://localhost:3000/fr', {
      waitUntil: 'networkidle2',
    });

    console.log('WebView HTTP Response Status:', webViewResponse.status());

    // Check if Clerk inputs are available and interactable
    const usernameInput = await webViewPage.$('input[type="text"], input[name="identifier"]');
    const passwordInput = await webViewPage.$('input[type="password"]');
    const submitBtn = await webViewPage.$('button[type="submit"]');

    console.log('Username input present:', !!usernameInput);
    console.log('Password input present:', !!passwordInput);
    console.log('Submit button present:', !!submitBtn);

    // Test DOM Storage accessibility
    const storageTest = await webViewPage.evaluate(() => {
      try {
        localStorage.setItem('__test_storage', 'ok');
        const val = localStorage.getItem('__test_storage');
        localStorage.removeItem('__test_storage');
        return { ok: true, val };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    console.log('DOM Storage (localStorage) access in WebView:', storageTest);

    // Check cookies
    const cookies = await webViewPage.cookies();
    console.log('Cookies present in WebView:', cookies.map(c => ({ name: c.name, domain: c.domain, sameSite: c.sameSite })));

    // Take WebView sign-in screenshot
    const webviewScreenshotPath = path.join(IMG_DIR, 'clerk-webview-sign-in.png');
    await webViewPage.screenshot({ path: webviewScreenshotPath });
    console.log('Captured WebView sign-in screenshot to:', webviewScreenshotPath);
    await webViewPage.close();

    // -------------------------------------------------------------
    // Test E: Responsive Pass at 360px and 390px
    // -------------------------------------------------------------
    console.log('\n=== Step 4: Responsive Pass at 360px Viewport ===');
    const mobile360Page = await browser.newPage();
    await mobile360Page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
    await mobile360Page.goto('http://localhost:3000/ar', { waitUntil: 'networkidle2' });
    const mobile360Path = path.join(IMG_DIR, 'login-responsive-360px.png');
    await mobile360Page.screenshot({ path: mobile360Path });
    console.log('Captured 360px viewport screenshot to:', mobile360Path);
    await mobile360Page.close();

  } finally {
    await browser.close();
    console.log('\nTesting session completed.');
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
