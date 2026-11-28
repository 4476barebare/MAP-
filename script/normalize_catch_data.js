import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 使い方:
//   node script/normalize_catch_data.js data/compiled_data.json KANTO/integrated_catch.json
//   node script/normalize_catch_data.js KANTO/integrated_catch.json
//   node script/normalize_catch_data.js --master=data/fish_master.json ...
// ==========================================
let explicitMasterPath = null;
const targetFiles = [];

for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--master=')) {
        explicitMasterPath = arg.slice('--master='.length);
    } else {
        targetFiles.push(arg);
    }
}

if (targetFiles.length === 0) {
    const defaults = [
        path.resolve(process.cwd(), 'data/compiled_data.json'),
        path.resolve(process.cwd(), 'KANTO/integrated_catch.json')
    ];
    for (const p of defaults) {
        if (fs.existsSync(p)) targetFiles.push(p);
    }
}

if (targetFiles.length === 0) {
    console.log('ℹ️ 処理対象の釣果JSONが見つかりませんでした。終了します。');
    process.exit(0);
}

// ==========================================
// 1. 共通魚種マスター (data/fish_master.json) の読み込み
// ==========================================
const DEFAULT_NG_FISH = [
    'サメ', 'カスザメ', 'ホシザメ', 'ドチザメ',
    'エイ', 'アカエイ',
    'フグ', 'クサフグ', 'ショウサイフグ', 'ヒガンフグ',
    'ウツボ', 'カニ', 'ワタリガニ', 'ガザミ', 'イシガニ',
    'ヤドカリ', 'ヒトデ', 'クラゲ', 'ウミヘビ', 'ゴンズイ'
];

const DEFAULT_KANTO_BOUNDS = {
    minLat: 34.60,
    maxLat: 37.15,
    minLng: 138.40,
    maxLng: 141.10
};

function resolveMasterPath(customPath) {
    if (customPath) {
        const resolved = path.resolve(customPath);
        if (!fs.existsSync(resolved)) {
            console.error(`❌ エラー: マスターファイルが見つかりません: ${resolved}`);
            process.exit(1);
        }
        return resolved;
    }

    const candidates = [
        path.resolve(process.cwd(), 'data/fish_master.json'),
        path.resolve(process.cwd(), 'fish_master.json'),
        path.resolve(__dirname, '../data/fish_master.json'),
        path.resolve(__dirname, '../fish_master.json'),
        path.resolve(__dirname, 'data/fish_master.json'),
        path.resolve(__dirname, 'fish_master.json')
    ];

    const found = candidates.find(p => fs.existsSync(p));
    if (!found) {
        console.error('❌ エラー: fish_master.json が見つかりません。');
        process.exit(1);
    }
    return found;
}

const masterPath = resolveMasterPath(explicitMasterPath);
const fishMaster = JSON.parse(fs.readFileSync(masterPath, 'utf8').replace(/^\uFEFF/, ''));
console.log(`📖 魚種マスター読込: ${masterPath} (v${fishMaster.version || 'unknown'})`);

// マスター未記載時でも安全に動作するようデフォルトへフォールバック
const ngFishSet = new Set(
    Array.isArray(fishMaster.ng_fish) ? fishMaster.ng_fish : DEFAULT_NG_FISH
);
const bounds = (fishMaster.kanto_bounds && typeof fishMaster.kanto_bounds === 'object')
    ? fishMaster.kanto_bounds
    : DEFAULT_KANTO_BOUNDS;

// 広義代表名への逆引きマップを構築（SNS・ブログ・ソナー・ランキング用）
const broadMap = new Map();
for (const [broadName, def] of Object.entries(fishMaster.groups || {})) {
    broadMap.set(broadName, broadName);
    for (const s of (def.spot || [])) {
        broadMap.set(s, broadName);
    }
    for (const a of (def.aliases || [])) {
        broadMap.set(a, broadName);
    }
}

function isWithinKantoBounds(lat, lng) {
    if (!bounds) return true;
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
    return (
        nLat >= bounds.minLat &&
        nLat <= bounds.maxLat &&
        nLng >= bounds.minLng &&
        nLng <= bounds.maxLng
    );
}

function normalizeBroadFishName(rawFish) {
    const cleaned = String(rawFish || '')
        .replace(/\u3000/g, ' ')
        .replace(/（.*?）|\(.*?\)/g, '')
        .trim();

    if (!cleaned) return null;
    if (ngFishSet.has(cleaned)) return null;

    const mapped = broadMap.get(cleaned) || cleaned;
    if (ngFishSet.has(mapped)) return null;

    return mapped;
}

function filterRecordArray(records, label, totalStats) {
    if (!Array.isArray(records)) return records;

    const cleanedList = [];
    const renamedMap = new Map();
    let ngDropped = 0;
    let oobDropped = 0;
    let renamedCount = 0;

    for (const item of records) {
        if (!item || typeof item !== 'object') continue;

        if (!isWithinKantoBounds(item.lat, item.lng)) {
            oobDropped++;
            continue;
        }

        const rawFish = String(item.fish || '').trim();
        const normalizedFish = normalizeBroadFishName(rawFish);
        if (!normalizedFish) {
            ngDropped++;
            continue;
        }

        if (rawFish !== normalizedFish) {
            renamedCount++;
            const key = `${rawFish} -> ${normalizedFish}`;
            renamedMap.set(key, (renamedMap.get(key) || 0) + 1);
        }

        cleanedList.push({
            ...item,
            fish: normalizedFish
        });
    }

    totalStats.input += records.length;
    totalStats.output += cleanedList.length;
    totalStats.renamed += renamedCount;
    totalStats.ngDropped += ngDropped;
    totalStats.oobDropped += oobDropped;

    console.log(`  [${label}] ${records.length}件 -> ${cleanedList.length}件 (正規化: ${renamedCount}件 / NG除外: ${ngDropped}件 / 圏外除外: ${oobDropped}件)`);
    if (renamedMap.size > 0) {
        for (const [k, count] of renamedMap.entries()) {
            console.log(`    - ${k} (${count}件)`);
        }
    }

    return cleanedList;
}

// ==========================================
// 2. 各釣果JSONファイルのクレンジング実行
// ==========================================
const totalStats = {
    filesProcessed: 0,
    filesUpdated: 0,
    input: 0,
    output: 0,
    renamed: 0,
    ngDropped: 0,
    oobDropped: 0
};

for (const filePath of targetFiles) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        console.warn(`⚠️ スキップ（ファイルなし）: ${resolved}`);
        continue;
    }

    console.log(`\n🧹 処理開始: ${resolved}`);
    const rawText = fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(rawText);

    let outputObj;
    if (Array.isArray(data)) {
        // KANTO/integrated_catch.json 形式（配列）
        outputObj = filterRecordArray(data, path.basename(resolved), totalStats);
    } else if (data && typeof data === 'object') {
        // data/compiled_data.json 形式（{ map_data: [...], blog_data: [...] }）
        outputObj = { ...data };
        if (Array.isArray(data.map_data)) {
            outputObj.map_data = filterRecordArray(data.map_data, 'map_data', totalStats);
        }
        if (Array.isArray(data.blog_data)) {
            outputObj.blog_data = filterRecordArray(data.blog_data, 'blog_data', totalStats);
        }
    } else {
        console.warn(`⚠️ 未対応のJSON構造のためスキップ: ${resolved}`);
        continue;
    }

    totalStats.filesProcessed++;
    const nextText = JSON.stringify(outputObj, null, 2) + '\n';
    if (rawText.trim() !== nextText.trim()) {
        fs.writeFileSync(resolved, nextText, 'utf8');
        totalStats.filesUpdated++;
        console.log(`✅ 更新保存: ${resolved}`);
    } else {
        console.log(`✨ 変更なし（スキップ）: ${resolved}`);
    }
}

console.log(
    `\n📊 合計: 対象 ${totalStats.filesProcessed}ファイル (更新 ${totalStats.filesUpdated}) / ` +
    `${totalStats.input}件 -> ${totalStats.output}件 ` +
    `(正規化 ${totalStats.renamed} / NG除外 ${totalStats.ngDropped} / 圏外除外 ${totalStats.oobDropped})`
);
