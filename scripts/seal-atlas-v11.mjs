import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, readdir, lstat, copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import {gzipSync, gunzipSync} from 'node:zlib';

// Seal only the supplied website and three exact drawing excerpts used by live cards.
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Provide release folder and a new output directory');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const originalSha = 'c28af9ec92f5abd68febddc05bc3ad9a7398a62c6e35586f78c1c0e35fbbeac9';
const zip = path.join(input, '3D_Атлас_Здание24_сайт_V11.zip');
if (sha(await readFile(zip)) !== originalSha) throw new Error('Unexpected V11 source archive');
await mkdir(output);
const site = path.join(output, 'TROITSK_B24_ATLAS_V11');
await mkdir(site);
execFileSync('unzip', ['-q', zip, '-d', site]);
const additions = [
  ['engineering/sources/AS2_changes.pdf', 'albums/AS2_changes.pdf', '6a0a364cc761b290b877d5c678e135b153113ea5a0cf4cd763a451cdc98e418e'],
  ['source_album/documents/AR_08_09_10_reconfirmed.pdf', 'albums/AR_08_09_10_reconfirmed.pdf', 'ef0e79649d9f474cdc71461ae66f2a5d0192b3ccc5612bdf7011931ac233625d'],
  ['engineering/history/branch_R15_B/sources/r13/R13_AR_PRIMARY_PAGES.pdf', 'albums/R13_AR_PRIMARY_PAGES.pdf', '2afa4d7c3b1bb2fed48d3de1be3bc6e75add72b15b306ca4bd08db6eced6349f']
];
for (const [from, to, expected] of additions) {
  const source = path.join(input, '3D_Атлас_Здание24_архив', from);
  if (sha(await readFile(source)) !== expected) throw new Error('Drawing excerpt integrity mismatch');
  await copyFile(source, path.join(site, to));
}
const linksPath = path.join(site, 'assets/package-links.js');
let links = await readFile(linksPath, 'utf8');
const configMatch = links.match(/var C=(\{[^\n]+\});/);
if (!configMatch) throw new Error('Unknown package-links format');
const config = JSON.parse(configMatch[1]);
for (const [from, to] of additions) config.albums[from] = to;
links = links.replace(configMatch[0], `var C=${JSON.stringify(config)};`);
await writeFile(linksPath, links);

// The old labels used the first sheet of a range, not the page being opened.
// Verified against AS.2 page stamps and independent single-page source records.
const sheets = {66:'56',67:'57',90:'80',91:'81',94:'84',153:'143',154:'144',157:'147'};
for (const [file, key, field] of [
  ['data/library.js', 'ATLAS_LIBRARY_GZIP', 'sources'],
  ['data/metadata-light.js', 'ATLAS_METADATA_GZIP', 'albumSources']
]) {
  const filename = path.join(site, file), text = await readFile(filename, 'utf8');
  const window = {};
  vm.runInNewContext(text, {window}, {timeout:10000});
  const data = JSON.parse(gunzipSync(Buffer.from(window[key], 'base64')));
  for (const [page, sheet] of Object.entries(sheets)) {
    const source = data[field][`NAV_AS2_PDF${page}`];
    if (!source || source.pdf_page !== Number(page)) throw new Error('Unknown source page');
    source.printed_sheet = sheet;
  }
  await writeFile(filename, text.replace(window[key], gzipSync(JSON.stringify(data), {level:9}).toString('base64')));
}
const releasePath = path.join(site, 'data/release-info.js');
const releaseText = await readFile(releasePath, 'utf8'), window = {};
vm.runInNewContext(releaseText, {window}, {timeout:10000});
window.ATLAS_RELEASE.release = '3D_ATLAS_V11';
await writeFile(releasePath, 'window.ATLAS_RELEASE='+JSON.stringify(window.ATLAS_RELEASE)+';\n');
await writeFile(path.join(site, 'CURRENT_RELEASE.json'), JSON.stringify({
  release:'V11', publishedRevision:'V11-PGS-20260928', sourceArchiveSha256:originalSha,
  sourceDate:'2026-09-27', geometryChangedFromSuppliedV11:false,
  elementAssignmentsChanged:false, newEngineeringApproval:false,
  drawingExcerpts:additions.map(([original, file, sha256]) => ({original,file,sha256})),
  correctedNavigationSheetLabels:sheets,
  limitations:['47 positions remain without confirmed placement.',
    'Source coverage limitations remain explicit; navigation validation is not engineering approval.',
    'The full engineering archive is not published as part of the website.']
}, null, 2));
const files=[];
async function walk(dir='') {
  for (const name of (await readdir(path.join(site,dir))).sort()) {
    const rel=path.posix.join(dir,name), stat=await lstat(path.join(site,rel));
    if(stat.isDirectory()) await walk(rel);
    else if(stat.isFile()) {const bytes=await readFile(path.join(site,rel));files.push({path:rel,bytes:bytes.length,sha256:sha(bytes)});}
    else throw new Error('Non-file source');
  }
}
await walk();
await writeFile(path.join(site,'MANIFEST.json'), JSON.stringify({release:'V11',sourceArchiveSha256:originalSha,files}));
execFileSync('zip',['-qr','TROITSK_B24_ATLAS_V11_FULL.zip','TROITSK_B24_ATLAS_V11'],{cwd:output});
const archive=await readFile(path.join(output,'TROITSK_B24_ATLAS_V11_FULL.zip'));
console.log(JSON.stringify({release:'V11',files:files.length+1,bytes:archive.length,sha256:sha(archive),sourceArchiveSha256:originalSha}));
