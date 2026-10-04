import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, readdir, lstat, copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import {gzipSync, gunzipSync} from 'node:zlib';

// Publish only the supplied website. The adjacent original drawing archive stays local.
const [input, output, publicExcerpt] = process.argv.slice(2);
if (!input || !output || !publicExcerpt) throw new Error('Provide website, new output directory and previously public excerpt');
const sha = b => createHash('sha256').update(b).digest('hex');
async function inventory(root, dir = '') {
  const files = [];
  for (const name of (await readdir(path.join(root, dir))).sort()) {
    if (name === '.DS_Store' || name.startsWith('._')) continue;
    const rel = path.posix.join(dir, name), stat = await lstat(path.join(root, rel));
    if (stat.isDirectory()) files.push(...await inventory(root, rel));
    else if (stat.isFile()) {
      const data = await readFile(path.join(root, rel));
      files.push({path: rel, bytes: data.length, sha256: sha(data)});
    } else throw new Error('Non-file source: ' + rel);
  }
  return files;
}
const sourceFiles = await inventory(input);
const sourceTreeSha256 = sha(JSON.stringify(sourceFiles));
await mkdir(output);
const site = path.join(output, 'TROITSK_B24_ATLAS_V12_10');
for (const file of sourceFiles) {
  await mkdir(path.dirname(path.join(site, file.path)), {recursive: true});
  await copyFile(path.join(input, file.path), path.join(site, file.path));
}
const read = name => readFile(path.join(site, name), 'utf8');
const write = (name, value) => writeFile(path.join(site, name), value);
function replace(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('Unexpected V12.10 source: ' + before.slice(0, 80));
  return text.replace(before, after);
}
function decode(text, key) {
  const window = {};
  vm.runInNewContext(text, {window}, {timeout: 10000});
  return {encoded: window[key], data: JSON.parse(gunzipSync(Buffer.from(window[key], 'base64')))};
}

// Restore the exact already-published excerpt required by two supplied recovery links.
const excerpt = 'drawings/R13_AR_PRIMARY_PAGES.pdf';
const data = await readFile(publicExcerpt);
const excerptSha = '2afa4d7c3b1bb2fed48d3de1be3bc6e75add72b15b306ca4bd08db6eced6349f';
if (sha(data) !== excerptSha) throw new Error('Previous public drawing excerpt mismatch');
await write('drawings/R13_AR_PRIMARY_PAGES.pdf', data);
let links = await read('assets/package-links.js');
const match = links.match(/var C=(\{[^\n]+\});/);
if (!match) throw new Error('Unknown package mapping');
const config = JSON.parse(match[1]);
config.map['engineering/history/branch_R15_B/sources/r13/R13_AR_PRIMARY_PAGES.pdf'] = 'drawings/R13_AR_PRIMARY_PAGES.pdf';
await write('assets/package-links.js', links.replace(match[0], `var C=${JSON.stringify(config)};`));

// V12.10 already contains the verified labels. Assert them without rewriting model data.
if (sha(await readFile(path.join(site, 'albums/AS2_last_full.pdf'))) !== '7bdae14400054eaacc5ef5b59fc1ff18ea85cd4e2b510e44dc443f600896bb77') throw new Error('AS.2 changed; recheck sheet labels');
const sheets = {66:'56',67:'57',90:'80',91:'81',94:'84',153:'143',154:'144',157:'147'};
const metadataText = await read('data/metadata-light.js');
const metadata = decode(metadataText, 'ATLAS_METADATA_GZIP');
const libraryText = await read('data/library.js');
const library = decode(libraryText, 'ATLAS_LIBRARY_GZIP');
for (const sources of [metadata.data.albumSources, library.data.sources]) for (const [page, sheet] of Object.entries(sheets)) {
  if (sources[`NAV_AS2_PDF${page}`]?.pdf_page !== Number(page)) throw new Error('Unknown source page');
  if (sources[`NAV_AS2_PDF${page}`].printed_sheet !== sheet) throw new Error('Unexpected navigation sheet label');
}
// Expose the release's new source pages in the drawing library as well as in the model.
library.data.sources = {...library.data.sources, ...metadata.data.albumSources};
await write('data/library.js', libraryText.replace(library.encoded, gzipSync(JSON.stringify(library.data), {level:9}).toString('base64')));

let engine = await read('assets/atlas-engine.js');
engine = replace(engine, "$('left').insertBefore(reviewControls,$('studyNavigation'));", "$('studyNavigation').before(reviewControls);");
engine = replace(engine, 'sourceAvailability:()=>albumSources,', 'sourceAvailability:()=>albumSources,sourceLinks:o=>albumLinks(o),');
await write('assets/atlas-engine.js', engine);
let card = await read('assets/atlas-card.js');
card = replace(card, 'const links = ((o.albumRecord && o.albumRecord.sources) || []).filter', 'const links = window.__FULL_ATLAS.sourceLinks(o).filter');
card = replace(card, '  function openSource(key, plan) {', `  function openPackagePdf(href) {
    const mapped = window.AtlasPackageLinks && window.AtlasPackageLinks.map(href);
    if (mapped && mapped.arc) return;
    window.open(mapped && mapped.href ? mapped.href : href, '_blank', 'noopener');
  }
  function openSource(key, plan) {`);
card = replace(card, "window.open(s.pdf_url.split('#')[0] + '#page=' + plan.pdfPage, '_blank', 'noopener');", "openPackagePdf(s.pdf_url.split('#')[0] + '#page=' + plan.pdfPage);");
card = replace(card, "window.open(plan.href, '_blank', 'noopener')", 'openPackagePdf(plan.href)');
await write('assets/atlas-card.js', card);
const registry = JSON.parse(await read('assets/source-recovery/registry.json'));
const sourceCount = Object.keys({...metadata.data.albumSources, ...registry.sources}).length;
let html = await read('library.html');
html = html.replaceAll('>290<', `>${sourceCount}<`);
html = replace(html, '<script src="assets/library.js"></script>', '<script src="assets/source-recovery/registry.js"></script><script src="assets/source-recovery/runtime.js"></script><script src="assets/library.js"></script>');
await write('library.html', html);
await write('assets/library.js', replace(await read('assets/library.js'), 'delete window.ATLAS_LIBRARY_GZIP;', 'delete window.ATLAS_LIBRARY_GZIP;const recovery=window.AtlasSourceRecovery.create(window.AtlasSourceRecoveryData,D.sources);D.sources=recovery.sources;D.records=D.records.map(r=>({...r,sources:recovery.links({sourceKeys:r.sources,albumRecord:r})}));'));
await write('assets/prototype.css', (await read('assets/prototype.css')).replaceAll('@media (max-width: 1180px) and (min-width: 851px)', '@media (max-width: 1400px) and (min-width: 851px)'));
const window = {};
vm.runInNewContext(await read('data/release-info.js'), {window}, {timeout:10000});
Object.assign(window.ATLAS_RELEASE, {sources:sourceCount});
if (window.ATLAS_RELEASE.release !== '3D_ATLAS_V12_10' || window.ATLAS_RELEASE.elements !== 11004 || window.ATLAS_RELEASE.rebar_on_demand !== 13325) throw new Error('Unexpected release identity');
await write('data/release-info.js', 'window.ATLAS_RELEASE=' + JSON.stringify(window.ATLAS_RELEASE) + ';\n');
const nodes = decode(await read('data/nodes.js'), 'ATLAS_NODES_GZIP').data;
if (nodes.nodes.length !== 557) throw new Error('Unexpected nodes register');

await write('CURRENT_RELEASE.json', JSON.stringify({
  release:'V12_10', label:'V12.10', sourceDate:'2026-10-04', publishedDate:'2026-10-04', sourceTreeSha256,
  geometryChangedFromSuppliedRelease:false, elementAssignmentsChanged:false, newEngineeringApproval:false,
  elements:11004, rebarOnDemand:13325, catalogueTypes:2950, sources:sourceCount, nodes:557,
  restoredPublicExcerpt:{path:'drawings/R13_AR_PRIMARY_PAGES.pdf', sha256:excerptSha},
  verifiedNavigationSheetLabels:sheets,
  integrationFixes:['Navigation startup race', 'Verified recovery links in cards/library', 'Split PDF page mapping for buttons', 'Source count', 'Compact toolbar breakpoint'],
  limitations:['47 positions remain without confirmed placement.', 'Navigation checks do not constitute engineering approval.', 'Known V12.10 search and loading limitations remain as supplied.', 'Original drawing folder and full engineering archive are not published.']
}, null, 2));
const files = await inventory(site);
await write('MANIFEST.json', JSON.stringify({release:'V12_10', sourceTreeSha256, files}));
execFileSync('zip', ['-qr', 'TROITSK_B24_ATLAS_V12_10_FULL.zip', 'TROITSK_B24_ATLAS_V12_10'], {cwd:output});
const archive = await readFile(path.join(output, 'TROITSK_B24_ATLAS_V12_10_FULL.zip'));
console.log(JSON.stringify({release:'V12_10', files:files.length+1, bytes:archive.length, sha256:sha(archive), sourceTreeSha256}));
