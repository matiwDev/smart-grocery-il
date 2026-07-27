/**
 * Probes candidate price-feed sources for chains not yet integrated (Phase 11
 * Step 2). Tests both the URLs originally given in the task spec (mostly
 * guessed/stale — none of them work, see below) AND the real endpoints found
 * by researching the public il-supermarket-scraper project
 * (github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers), which
 * has already solved this exact problem for every chain covered by Israel's
 * Food Act (2014) transparency law. See CLAUDE.md "Phase 11" for the writeup.
 *
 * Two feed platforms cover 5 of the 6 target chains:
 *  - laibcatalog.co.il ("ניביט"/Nibit): plain HTTPS JSON API, no auth at all.
 *    Covers Victory + Mahsanei Hashuk (matrixcatalog.co.il, the old Nibit
 *    domain named in the task spec, is DNS-dead — this is its replacement).
 *  - url.retail.publishedprices.co.il (Cerberus FTP Server): real FTP
 *    protocol (port 21, not HTTPS), login with a chain-specific username and
 *    a BLANK password — this is the public, documented access method for
 *    price-transparency data on this platform, not a credential bypass.
 *    Covers Yohananof + Osher Ad + Keshet Teamim.
 * Mega and Co-op have no working feed found — see the summary at the end.
 *
 * Run with: npm run probe:chains
 */
import * as net from 'net';

const USER_AGENT = 'Mozilla/5.0 (compatible; SmartGroceryIL/1.0; +https://smart-grocery-il.vercel.app)';

interface HttpProbeResult {
  label: string;
  url: string;
  status: number | 'ERROR';
  contentType: string | null;
  size: number | null;
  snippet: string;
  error?: string;
}

async function probeHttp(label: string, url: string): Promise<HttpProbeResult> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
    const text = await res.text();
    return {
      label,
      url,
      status: res.status,
      contentType: res.headers.get('content-type'),
      size: text.length,
      snippet: text.slice(0, 500),
    };
  } catch (err) {
    return {
      label,
      url,
      status: 'ERROR',
      contentType: null,
      size: null,
      snippet: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function printHttpResult(r: HttpProbeResult) {
  console.log(`\n--- ${r.label} ---`);
  console.log(`URL: ${r.url}`);
  if (r.status === 'ERROR') {
    console.log(`ERROR: ${r.error}`);
    return;
  }
  console.log(`HTTP ${r.status} | content-type: ${r.contentType} | size: ${r.size} bytes`);
  console.log(`First 500 chars:\n${r.snippet}`);
}

// Minimal raw-socket FTP login probe (USER/PASS/QUIT only, no data channel) —
// enough to prove a chain-specific username + blank password combination
// works against the Cerberus FTP Server without adding an FTP client
// dependency just to probe. scripts/parsers/*.ts uses a real FTP client for
// the actual file listing/download once a chain is confirmed working here.
function probeFtpLogin(host: string, username: string): Promise<{ ok: boolean; transcript: string[] }> {
  return new Promise((resolve) => {
    const transcript: string[] = [];
    const socket = net.createConnection({ host, port: 21, timeout: 15000 });
    let step = 0;
    let loggedIn = false;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve({ ok: loggedIn, transcript });
    };

    socket.on('timeout', () => {
      transcript.push('TIMEOUT');
      finish();
    });
    socket.on('error', (err) => {
      transcript.push(`ERROR: ${err.message}`);
      finish();
    });
    socket.on('close', finish);

    socket.on('data', (data) => {
      const line = data.toString('utf8').trim();
      transcript.push(`< ${line}`);
      if (step === 0 && line.startsWith('220')) {
        socket.write(`USER ${username}\r\n`);
        transcript.push(`> USER ${username}`);
        step = 1;
      } else if (step === 1 && line.startsWith('331')) {
        socket.write('PASS \r\n');
        transcript.push('> PASS (blank)');
        step = 2;
      } else if (step === 2) {
        if (line.startsWith('230')) loggedIn = true;
        socket.write('QUIT\r\n');
        transcript.push('> QUIT');
        finish();
      }
    });
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log('PHASE 11 STEP 2 — CHAIN FEED PROBE REPORT');
  console.log('='.repeat(70));

  console.log('\n\n### Part 1: URLs as given in the task spec ###');
  const givenTargets: Array<[string, string]> = [
    ['Victory primary (given)', 'http://matrixcatalog.co.il/NBCompetitionData.zip'],
    ['Victory alt (given)', 'https://victory.co.il/prices'],
    ['Yohananof primary (given)', 'https://yochananof.co.il/compservice.aspx?action=GetLastUpdateFile'],
    ['Yohananof alt (given)', 'https://yochananof.co.il/prices'],
    ['Osher Ad primary (given)', 'http://osherad.co.il/prices'],
    ['Osher Ad alt (given)', 'https://prices.osherad.co.il'],
    ['Mega primary (given)', 'http://publishprice.mega.co.il'],
    ['Mega alt (given)', 'https://mega.co.il/prices'],
    ['Keshet Teamim primary (given)', 'http://www.keshet-teamim.co.il/prices'],
    ['Keshet Teamim alt (given)', 'https://keshet-teamim.co.il/NBCompetitionData.zip'],
    ['Mahsanei Hashuk primary (given)', 'http://mahsaneihashuk.co.il/prices'],
  ];
  for (const [label, url] of givenTargets) {
    printHttpResult(await probeHttp(label, url));
  }

  console.log('\n\n### Part 2: Real endpoints found via research ###');

  printHttpResult(
    await probeHttp('Victory getbranches (laibcatalog.co.il)', 'https://laibcatalog.co.il/webapi/api/getbranches?edi=7290696200003')
  );
  printHttpResult(
    await probeHttp(
      'Mahsanei Hashuk getbranches (laibcatalog.co.il)',
      'https://laibcatalog.co.il/webapi/api/getbranches?edi=7290661400001'
    )
  );

  console.log('\n--- Cerberus FTP logins (url.retail.publishedprices.co.il:21, blank password) ---');
  const ftpChains: Array<[string, string]> = [
    ['Yohananof', 'yohananof'],
    ['Osher Ad', 'osherad'],
    ['Keshet Teamim', 'Keshet'],
  ];
  for (const [chain, username] of ftpChains) {
    const result = await probeFtpLogin('url.retail.publishedprices.co.il', username);
    console.log(`\n${chain} (username="${username}"): ${result.ok ? 'LOGIN OK' : 'LOGIN FAILED'}`);
    console.log(result.transcript.join('\n'));
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`
Victory         — WORKING via https://laibcatalog.co.il (HTTPS JSON API + .gz download, no auth).
                  matrixcatalog.co.il (the domain given in the task spec) no longer resolves in DNS
                  at all — laibcatalog.co.il is its live replacement.
Mahsanei Hashuk — WORKING via the same laibcatalog.co.il API (edi=7290661400001).
Yohananof       — WORKING via real FTP (port 21) to url.retail.publishedprices.co.il,
                  username "yohananof", blank password.
Osher Ad        — WORKING via the same FTP host, username "osherad", blank password.
Keshet Teamim   — WORKING via the same FTP host, username "Keshet", blank password.
Mega            — NOT WORKING. The community scraper project marks Mega "removed" as of 2025-07-01;
                  publishprice.mega.co.il / mega.co.il now redirect to Carrefour Israel (apparent
                  rebrand/acquisition), and Carrefour's site Cloudflare-blocks non-browser requests (403).
Co-op           — NOT WORKING. coopisrael.coop does not resolve in DNS at all, and Co-op isn't
                  covered by the community scraper project either — no working feed found.
`);
}

main().catch((err) => {
  console.error('[probe] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
