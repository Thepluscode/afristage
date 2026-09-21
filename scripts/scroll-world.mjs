import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { validManifest } from '../apps/landing/assets/scroll-world/runtime/engine.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ASSETS = join(ROOT, 'apps/landing/assets/scroll-world');
export const RUN = join(ROOT, '.scroll-world/seedance-mini-v1');
export const MODEL = 'bytedance/seedance-2-mini';
export const PLAN = { model: MODEL, duration: 5, resolution: '720p', aspect_ratio: '16:9', generate_audio: false, legs: 4, creditsPerSecond: 8.2, maxCredits: 164 };
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const save = (p, data) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p + '.next', JSON.stringify(data, null, 2) + '\n'); renameSync(p + '.next', p); };
const command = (name, args) => execFileSync(name, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const ff = args => command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
export const probe = p => JSON.parse(command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', p]));
const fpsOf = stream => stream.avg_frame_rate.split('/').map(Number).reduce((a, b) => a / b);
const raw = i => join(RUN, `leg-${i}.mp4`);
const sourceVideo = i => existsSync(join(RUN, `leg-${i}-repaired.mp4`)) ? join(RUN, `leg-${i}-repaired.mp4`) : raw(i);
const statePath = i => join(RUN, `leg-${i}.json`);
const scenes = () => json(join(ASSETS, 'runtime/scenes.json'));
const MEDIA = join(ASSETS, 'media');

export function requestBody(prompt, firstFrame) {
  if (typeof prompt !== 'string' || prompt.length < 3 || prompt.length > 20000) throw new Error('Invalid prompt');
  const u = new URL(firstFrame);
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('First frame must be an HTTPS image URL');
  return { model: MODEL, input: { prompt, first_frame_url: firstFrame, duration: PLAN.duration,
    aspect_ratio: PLAN.aspect_ratio, resolution: PLAN.resolution, generate_audio: false, nsfw_checker: true } };
}
export function taskRecord(response) {
  if (response?.code !== 200 || !response.data || typeof response.data.state !== 'string') throw new Error('Invalid task response; preserve job ID and poll again');
  const d = response.data;
  if (!['waiting', 'queuing', 'generating', 'success', 'fail'].includes(d.state)) throw new Error(`Unrecognized task state: ${d.state}; do not resubmit`);
  if (d.state !== 'success') return { state: d.state, failure: d.failMsg || null };
  const result = typeof d.resultJson === 'string' ? JSON.parse(d.resultJson) : d.response;
  const url = result?.resultUrls?.[0];
  if (!url || new URL(url).protocol !== 'https:') throw new Error('Success without a valid result URL; do not resubmit');
  return { state: 'success', url, credits: d.creditsConsumed ?? null };
}
async function api(path, options = {}) {
  const key = readFileSync(join(homedir(), '.kie-api-key'), 'utf8').trim();
  const response = await fetch(`https://api.kie.ai${path}`, { ...options, redirect: 'error',
    signal: AbortSignal.timeout(25000), headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) throw new Error(`KIE HTTP ${response.status}`);
  const value = await response.json();
  if (value.code !== 200) throw new Error(`KIE rejected request (code ${value.code})`);
  return value;
}
export function requiredCredits(completed, rate = PLAN.creditsPerSecond) {
  if (!Number.isInteger(completed) || completed < 0 || completed > 4 || !Number.isFinite(rate) || rate <= 0) throw new Error('Invalid budget inputs');
  return Math.round((4 - completed) * PLAN.duration * rate * 100) / 100;
}
export async function preflight() {
  const [balance, models] = await Promise.all([api('/api/v1/chat/credit'), api('/api/v1/models')]);
  const model = models.data?.models?.find(m => m.slug === MODEL);
  const description = model?.pricingDesc || '';
  const match = description.match(/720p[^\n]*?\|\s*([\d.]+)\s*credits\/s[^\n]*no video/i);
  if (!match) throw new Error('Cannot verify current 720p first-frame pricing; no submission permitted');
  const rate = Number(match[1]);
  const completed = [1, 2, 3, 4].filter(i => {
    if (!existsSync(statePath(i))) return false;
    const job = json(statePath(i));
    return job.state === 'success' && (i === 1 || job.handoff?.passed === true);
  }).length;
  const needed = requiredCredits(completed, rate);
  const reserved = [1,2,3,4].filter(i=>existsSync(statePath(i))).reduce((sum,i)=>sum + (json(statePath(i)).reservedCredits || 0),0);
  const record = { checkedAt: new Date().toISOString(), model: MODEL, credits: balance.data, needed,
    rate, maxCredits: PLAN.maxCredits, reserved, pricing: description,
    allowed: typeof balance.data === 'number' && balance.data >= needed && rate <= PLAN.creditsPerSecond && reserved + needed <= PLAN.maxCredits };
  save(join(RUN, 'preflight.json'), record);
  return record;
}
export function prepare() {
  if ([1,2,3,4].some(i => existsSync(statePath(i)))) throw new Error('Generation has started; preserve the selected masters and journals');
  mkdirSync(RUN, { recursive: true }); mkdirSync(MEDIA, { recursive: true });
  const names = ['scene-01-going-live-v1.png', 'anchor-live-stage-v1.png', 'scene-03-transparent-ledger-v3.png', 'scene-04-payout-reach-v1.png'];
  const selected = names.map((name, index) => {
    const source = join(ASSETS, 'generated', name), output = join(RUN, `scene-${index+1}-16x9.png`);
    // Contain the approved composition; padding preserves the spotlight and stage.
    ff(['-i', source, '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0a0807,setsar=1', '-frames:v', '1', output]);
    return { scene: index+1, source: name, sha256: hash(source), master: output, masterSha256: hash(output) };
  });
  save(join(RUN, 'selected.json'), { authorization: 'User: GO Fix all the gaps with your recommended corrections', selected });
  return selected;
}
async function upload(file) {
  const form = new FormData();
  form.set('file', new Blob([readFileSync(file)], { type: 'image/png' }), `${hash(file)}.png`);
  form.set('uploadPath', 'afristage/scroll-world');
  const response = await fetch('https://kieai.redpandaai.co/api/file-stream-upload', { method: 'POST', body: form, redirect: 'error',
    headers: { Authorization: `Bearer ${readFileSync(join(homedir(), '.kie-api-key'), 'utf8').trim()}` }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Image upload HTTP ${response.status}`);
  const value = await response.json();
  if (value.code !== 200 || value.success !== true || !value.data?.downloadUrl) throw new Error('Image upload did not return a URL');
  return value.data.downloadUrl;
}
export async function submit(i) {
  if (![1,2,3,4].includes(i)) throw new Error('Leg must be 1..4');
  if (existsSync(statePath(i))) throw new Error(`Leg ${i} already has a journal. Poll/reconcile it; automatic resubmission is forbidden.`);
  if (!existsSync(join(RUN, 'selected.json'))) throw new Error('Run prepare first');
  if (i > 1) {
    const previous = json(statePath(i-1));
    if (previous.state !== 'success' || !previous.review?.passed || previous.review.sha256 !== hash(sourceVideo(i-1))) throw new Error('Previous leg needs a successful, visually reviewed render');
  }
  const budget = await preflight();
  if (!budget.allowed || budget.reserved + PLAN.duration * budget.rate > PLAN.maxCredits) throw new Error(`Budget gate: ${budget.credits} available, ${budget.needed} needed for remaining chain; cap ${PLAN.maxCredits}`);
  const source = i === 1 ? join(RUN, 'scene-1-16x9.png') : join(RUN, `leg-${i-1}-last.png`);
  const prompt = readFileSync(join(ASSETS, `prompts/leg-${i}.txt`), 'utf8');
  requestBody(prompt, 'https://example.com/validated-input.png'); // No paid request is used to discover fields.
  const firstFrame = await upload(source);
  const payload = requestBody(prompt, firstFrame);
  const journal = { leg: i, state: 'submitting', attemptId: randomUUID(), createdAt: new Date().toISOString(),
    reservedCredits: PLAN.duration * budget.rate, inputSha256: hash(source), payload };
  // Exclusive create prevents concurrent callers submitting the same paid leg.
  writeFileSync(statePath(i), JSON.stringify(journal, null, 2), { flag: 'wx', mode: 0o600 });
  try {
    const response = await api('/api/v1/jobs/createTask', { method: 'POST', body: JSON.stringify(payload) });
    if (!response.data?.taskId) throw new Error('No task ID returned');
    save(statePath(i), { ...journal, state: 'waiting', taskId: response.data.taskId });
    return { leg: i, state: 'waiting', taskId: response.data.taskId };
  } catch (error) {
    save(statePath(i), { ...journal, state: 'submission-uncertain', error: error.message });
    throw new Error('Submission outcome uncertain. Reconcile the existing attempt in KIE; never retry this POST automatically.');
  }
}
export async function poll(i) {
  const journal = json(statePath(i));
  if (!journal.taskId) throw new Error('No task ID. Reconcile the uncertain submission in KIE.');
  const response = await api(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(journal.taskId)}`);
  const record = taskRecord(response);
  save(statePath(i), { ...journal, ...record, checkedAt: new Date().toISOString() });
  if (record.state === 'success' && !existsSync(raw(i))) {
    const response = await fetch(record.url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error(`Result download HTTP ${response.status}; poll again to resume download`);
    writeFileSync(raw(i) + '.part', Buffer.from(await response.arrayBuffer()));
    probe(raw(i) + '.part'); renameSync(raw(i) + '.part', raw(i));
  }
  if (record.state === 'success') {
    const p = probe(raw(i)), stream = p.streams.find(s=>s.codec_type==='video');
    ff(['-i', raw(i), '-vf', `select=eq(n\\,${Number(stream.nb_frames)-1})`, '-frames:v', '1', join(RUN, `leg-${i}-last.png`)]);
    ff(['-i', raw(i), '-vf', 'fps=1,scale=384:-1,tile=5x1', '-frames:v', '1', join(RUN, `leg-${i}-review.jpg`)]);
  }
  const handoff = record.state === 'success' && i > 1 ? checkHandoff(i) : undefined;
  return { leg: i, state: record.state, credits: record.credits ?? null, handoff };
}
export function checkHandoff(i) {
  if (![2,3,4].includes(i)) throw new Error('Handoff applies to legs 2..4');
  const first = join(RUN, `leg-${i}-first-raw.png`);
  ff(['-i', sourceVideo(i), '-frames:v', '1', first]);
  const previousLast = join(RUN, `leg-${i-1}-delivery-last.png`);
  const previousStream = probe(sourceVideo(i-1)).streams.find(s=>s.codec_type==='video');
  ff(['-i', sourceVideo(i-1), '-vf', `select=eq(n\\,${Number(previousStream.nb_frames)-1})`, '-frames:v', '1', previousLast]);
  const score = similarity(previousLast, first);
  const record = { score, threshold: .90, passed: score >= .90, sourceSha256: hash(sourceVideo(i)), checkedAt: new Date().toISOString() };
  save(statePath(i), { ...json(statePath(i)), handoff: record });
  return record;
}
export function repair(i) {
  if (![2,3,4].includes(i)) throw new Error('Only legs 2..4 can be repaired');
  const journal = json(statePath(i));
  if (journal.state !== 'success' || !existsSync(raw(i))) throw new Error('Only a downloaded successful render can be repaired');
  const previousLast = join(RUN, `leg-${i-1}-last.png`), output = join(RUN, `leg-${i}-repaired.mp4`);
  if (!existsSync(previousLast)) throw new Error('Previous actual final frame is missing');
  const frames = Number(probe(raw(i)).streams.find(s=>s.codec_type==='video').nb_frames);
  ff(['-loop','1','-framerate','24','-i',previousLast,'-i',raw(i),'-filter_complex',"[1:v][0:v]overlay=enable='eq(n,0)'[v]",'-map','[v]','-frames:v',String(frames),'-an','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-g','8','-keyint_min','8','-sc_threshold','0','-movflags','+faststart',output]);
  const handoff = checkHandoff(i);
  if (!handoff.passed) throw new Error(`Frame-lock repair still failed: SSIM=${handoff.score}`);
  const repaired = { passed:true, method:'replace-first-decoded-frame', rawSha256:hash(raw(i)), repairedSha256:hash(output), handoff, repairedAt:new Date().toISOString() };
  save(statePath(i), { ...json(statePath(i)), repair:repaired });
  return repaired;
}
export function review(i, note) {
  if (![1,2,3,4].includes(i) || !note || note.length < 30) throw new Error('Review requires leg 1..4 and an explicit visual observation');
  const journal = json(statePath(i));
  if (journal.state !== 'success' || !existsSync(raw(i))) throw new Error('Only a downloaded successful render can be reviewed');
  if (i > 1 && !checkHandoff(i).passed) throw new Error('Actual-frame handoff failed; visual review cannot waive the seam gate');
  const record = { passed: true, sha256: hash(sourceVideo(i)), note, reviewedAt: new Date().toISOString() };
  save(statePath(i), { ...json(statePath(i)), review: record });
  return { leg: i, review: record };
}
export function encode() {
  save(join(ASSETS, 'runtime/manifest.json'), {version:1,status:'pending',architecture:'A',model:MODEL,clips:[],seams:[]});
  for (const i of [1,2,3,4]) {
    const source = sourceVideo(i), p = probe(source), stream = p.streams.find(s=>s.codec_type==='video');
    if (stream.height < 720 || stream.width / stream.height !== 16/9) throw new Error(`Leg ${i}: expected native 16:9 >=720p`);
    const journal = json(statePath(i));
    if (journal.state !== 'success' || !journal.review?.passed || journal.review.sha256 !== hash(source)) throw new Error(`Leg ${i} has not passed visual review`);
    for (const mobile of [false,true]) {
      const stem = `leg-${i}${mobile ? '-m' : ''}`, output = join(MEDIA, `${stem}.mp4`);
      ff(['-i', source, '-an', '-vf', mobile ? 'scale=-2:720,setsar=1' : 'setsar=1', '-c:v', 'libx264', '-preset', 'slow', '-crf', mobile ? '23':'20', '-pix_fmt', 'yuv420p', '-g', mobile ? '4':'8', '-keyint_min', mobile ? '4':'8', '-sc_threshold', '0', '-movflags', '+faststart', output]);
      ff(['-i', output, '-frames:v', '1', join(MEDIA, `${stem}-poster.png`)]);
      save(join(RUN, `${stem}-encode.json`), { sourceSha256: hash(source), outputSha256: hash(output), posterSha256: hash(join(MEDIA, `${stem}-poster.png`)) });
    }
  }
}
function similarity(a,b) {
  // ffmpeg emits the SSIM statistic on stderr, including on successful runs.
  const result = spawnSync('ffmpeg',['-hide_banner','-i',a,'-i',b,'-filter_complex','[0:v]format=yuv420p[a];[1:v]format=yuv420p[b];[a][b]ssim','-f','null','-'],{encoding:'utf8'});
  if(result.status!==0)throw new Error('SSIM comparison failed');
  const value = Number(result.stderr.match(/All:([0-9.]+)/)?.[1]); if (!Number.isFinite(value)) throw new Error('SSIM measurement missing'); return value;
}
export function verifyAssets() {
  mkdirSync(RUN,{recursive:true});
  save(join(ASSETS, 'runtime/manifest.json'), {version:1,status:'pending',architecture:'A',model:MODEL,clips:[],seams:[]});
  const clips = [], seams = [], fingerprints = {};
  for (const i of [1,2,3,4]) {
    const journal=json(statePath(i));
    if(journal.state!=='success'||!journal.review?.passed||journal.review.sha256!==hash(sourceVideo(i)))throw new Error(`Leg ${i}: render lacks visual approval`);
    const expectedInput=i===1?join(RUN,'scene-1-16x9.png'):join(RUN,`leg-${i-1}-last.png`);
    if (i > 1) {
      // Submission handoff uses the provider's raw final frame; delivery repair
      // affects only the current leg's first frame, not this input provenance.
      const source = raw(i-1), frames = Number(probe(source).streams.find(s=>s.codec_type==='video').nb_frames);
      const actualLast = join(RUN, `leg-${i-1}-verified-last.png`);
      ff(['-i',source,'-vf',`select=eq(n\\,${frames-1})`,'-frames:v','1',actualLast]);
      if (hash(actualLast) !== hash(expectedInput)) throw new Error(`Leg ${i}: cached handoff is not the actual final source frame`);
    }
    if(journal.inputSha256!==hash(expectedInput))throw new Error(`Leg ${i}: wrong handoff input`);
    const clip = {};
    for (const mobile of [false,true]) {
      const stem=`leg-${i}${mobile?'-m':''}`, relative=`media/${stem}.mp4`, file=join(ASSETS,relative);
      const provenance = json(join(RUN, `${stem}-encode.json`));
      if (provenance.sourceSha256 !== hash(sourceVideo(i)) || provenance.outputSha256 !== hash(file) ||
          provenance.posterSha256 !== hash(join(MEDIA, `${stem}-poster.png`))) throw new Error(`${relative}: encode provenance changed`);
      const info=probe(file), video=info.streams.find(s=>s.codec_type==='video'), fps=fpsOf(video);
      if(info.streams.some(s=>s.codec_type==='audio'))throw new Error(`${relative}: audio must be stripped`);
      if(video.codec_name!=='h264'||video.pix_fmt!=='yuv420p'||video.width/video.height!==16/9||video.height<720)throw new Error(`${relative}: invalid delivery format`);
      const frames=Number(video.nb_frames), duration=Number(video.duration);
      if(!Number.isInteger(frames)||frames<2||Math.abs(duration-5)>.25)throw new Error(`${relative}: invalid duration/frame count`);
      const data=readFileSync(file); if(data.indexOf(Buffer.from('moov'))>data.indexOf(Buffer.from('mdat')))throw new Error(`${relative}: faststart missing`);
      const frameData=JSON.parse(command('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=key_frame','-of','json',file])).frames;
      let lastKey=0; frameData.forEach((f,n)=>{if(f.key_frame)lastKey=n;if(n-lastKey>=(mobile?4:8))throw new Error(`${relative}: GOP exceeds seek budget`);});
      const first=join(RUN,`${stem}-first.png`),last=join(RUN,`${stem}-end.png`),poster=join(MEDIA,`${stem}-poster.png`);
      ff(['-i',file,'-frames:v','1',first]); ff(['-i',file,'-vf',`select=eq(n\\,${frames-1})`,'-frames:v','1',last]);
      if(similarity(first,poster)<.999)throw new Error(`${relative}: poster differs from first frame`);
      fingerprints[relative]=hash(file);fingerprints[`media/${stem}-poster.png`]=hash(poster);
      clip[mobile?'mobile':'desktop']=relative; clip[mobile?'posterMobile':'poster']=`media/${stem}-poster.png`;
      clip.duration=duration;clip.fps=fps;
      if(i>1){const score=similarity(join(RUN,`leg-${i-1}${mobile?'-m':''}-end.png`),first);if(score<.90)throw new Error(`Seam ${i-1}>${i} ${mobile?'mobile':'desktop'} SSIM=${score} <0.90`);(seams[i-2]??={from:i-1,to:i})[mobile?'mobile':'desktop']=score;}
    }
    clips.push(clip);
  }
  const result={version:1,status:'verified',architecture:'A',model:MODEL,clips,seams,sha256:fingerprints,checkedAt:new Date().toISOString()};
  save(join(ASSETS,'runtime/manifest.json'),result);return result;
}
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sync() {
  const manifest=json(join(ASSETS,'runtime/manifest.json'));
  if(manifest.status==='verified'){
    if (!validManifest(manifest, 4)) throw new Error('Verified manifest structure is invalid');
    if(Object.keys(manifest.sha256||{}).length!==16)throw new Error('Verified manifest needs fingerprints for all delivery assets');
    const references = manifest.clips.flatMap(c => [c.desktop,c.mobile,c.poster,c.posterMobile]);
    if (new Set(references).size !== 16 || references.some(path => !manifest.sha256[path])) throw new Error('Every referenced asset needs its own verification fingerprint');
    for(const [path,digest] of Object.entries(manifest.sha256)){
      if(!/^media\/[a-zA-Z0-9._-]+$/.test(path)||hash(join(ASSETS,path))!==digest)throw new Error(`Asset changed since verification: ${path}`);
    }
  }
  const target=join(ROOT,'apps/admin-web/public/site/scroll-world');
  for(const dir of ['runtime','web','media']){
    mkdirSync(join(target,dir),{recursive:true});
    for(const file of readdirSync(join(ASSETS,dir))){const source=join(ASSETS,dir,file);if(statSync(source).isFile())copyFileSync(source,join(target,dir,file));}
  }
  const block=`<!-- scroll-world:start -->\n<div class="aw-world" id="scroll-world" aria-label="One night on AfriStage"><div class="aw-pin">\n<div class="aw-controls"><a class="aw-skip" href="#stagecraft">Skip the story</a></div><div class="aw-scenes">\n${scenes().map((s,i)=>`<figure class="aw-scene"><div class="aw-visual"><img src="assets/scroll-world/web/${s.still}" srcset="assets/scroll-world/web/${s.still} ${s.width}w, assets/scroll-world/web/${s.still.replace('.jpg','@2x.jpg')} 2560w" sizes="100vw" width="${s.width}" height="${s.height}" loading="lazy" decoding="async" alt="${escape(s.alt)}" /></div><figcaption class="aw-caption"><span class="aw-eyebrow">${escape(s.eyebrow)}</span><h2>${escape(s.title)}</h2><p>${escape(s.body)}</p>${i===3?'<a class="aw-cta" href="#begin">Claim your stage</a>':''}</figcaption></figure>`).join('\n')}\n</div></div></div>\n<!-- scroll-world:end -->`;
  const page=join(ROOT,'apps/landing/index.html');
  if(existsSync(page)){const input=readFileSync(page,'utf8');if(!input.includes('<!-- scroll-world:start -->'))throw new Error('Static page needs ScrollWorld markers');writeFileSync(page,input.replace(/<!-- scroll-world:start -->[\s\S]*?<!-- scroll-world:end -->/,block));}
  return {synced:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [action,number]=process.argv.slice(2);
  const actions={prepare,preflight,sync,submit:()=>submit(Number(number)),poll:()=>poll(Number(number)),handoff:()=>checkHandoff(Number(number)),repair:()=>repair(Number(number)),review:()=>review(Number(number), process.argv.slice(4).join(' ')),encode,verify:verifyAssets};
  if(!actions[action]){console.error('Usage: node scripts/scroll-world.mjs prepare|preflight|submit N|poll N|review N "observation"|encode|verify|sync');process.exitCode=1;}
  else try{console.log(JSON.stringify(await actions[action](),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
