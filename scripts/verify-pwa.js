const fs = require('fs');

async function checkHead() {
  try {
    const res = await fetch('http://localhost:3000/fr');
    const html = await res.text();
    
    const manifestMatch = html.match(/<link[^>]+rel=["']manifest["'][^>]*>/i);
    const appleTouchMatch = html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/i);
    const appleStartupMatch = html.match(/<link[^>]+rel=["']apple-touch-startup-image["'][^>]*>/i);
    const appleCapableMatch = html.match(/<meta[^>]+name=["']apple-mobile-web-app-capable["'][^>]*>/i);
    const themeColorMatch = html.match(/<meta[^>]+name=["']theme-color["'][^>]*>/i);
    const viewportMatch = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i);
    
    console.log('--- PWA Head Tags Verification ---');
    console.log('manifest link:', manifestMatch ? manifestMatch[0] : 'MISSING');
    console.log('apple-touch-icon link:', appleTouchMatch ? appleTouchMatch[0] : 'MISSING');
    console.log('apple-touch-startup-image:', appleStartupMatch ? appleStartupMatch[0] : 'MISSING');
    console.log('apple-mobile-web-app-capable:', appleCapableMatch ? appleCapableMatch[0] : 'MISSING');
    console.log('theme-color meta:', themeColorMatch ? themeColorMatch[0] : 'MISSING');
    console.log('viewport meta:', viewportMatch ? viewportMatch[0] : 'MISSING');
    console.log('--- End of Verification ---');
  } catch (err) {
    console.error('Error fetching /fr:', err.message);
  }
}

checkHead();
