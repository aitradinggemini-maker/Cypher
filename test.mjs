import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  
  // Wait a bit to let React mount
  await new Promise(r => setTimeout(r, 3000));
  
  const html = await page.evaluate(() => document.body.innerHTML);
  console.log("HTML:", html.substring(0, 1000));
  
  const isRed = await page.evaluate(() => {
    const el = document.querySelector('.bg-red-950');
    return el ? el.className : null;
  });
  
  console.log("Red screen class:", isRed);
  
  await browser.close();
})();
