import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const explicitMasterPath = process.argv[4];

if (!inputPath || !outputPath) {
    console.error('❌ エラー: 入力ファイルまたは出力ファイルのパスが指定されていません。');
    console.error('使い方: node script/convert_fish.js <input.csv|input.json> <output.json> [fish_master.json]');
    process.exit(1);
}

// ==========================================
// 1. 共通魚種マスター (fish_master.json) の読み込み
// ==========================================
function resolveMasterPath(customPath) {
    if (customPath) {
        const resolved = path.resolve(customPath);
        if (!fs.existsSync(resolved)) {
            console.error(`❌ エラー: 指定されたマスターファイルが見つかりません: ${resolved}`);
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

    return candidates.find(p => fs.existsSync(p)) || null;
}

function loadFishMaster(customPath) {
    const masterPath = resolveMasterPath(customPath);
    if (!masterPath) {
        console.warn('⚠️ 警告: fish_master.json が見つかりません。魚種名の正規化なしで変換を続行します。');
        return {
            non_fish: { exact: [], keywords: [] },
            spot_aliases: {}
        };
    }

    const raw = fs.readFileSync(masterPath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    console.log(`📖 魚種マスター読込: ${masterPath} (v${parsed.version || 'unknown'})`);
    return parsed;
}

const fishMaster = loadFishMaster(explicitMasterPath);
const nonFishExact = new Set(fishMaster.non_fish?.exact || []);
const nonFishKeywords = Array.isArray(fishMaster.non_fish?.keywords) ? fishMaster.non_fish.keywords : [];
const spotAliases = fishMaster.spot_aliases || {};

function isNonFishEntry(name) {
    if (nonFishExact.has(name)) return true;
    return nonFishKeywords.some(kw => kw && name.includes(kw));
}

function normalizeSpotFishName(rawName) {
    const cleaned = String(rawName || '').replace(/\u3000/g, ' ').trim();
    if (!cleaned) return '';

    // ボート店・漁協などの非魚種エントリーは無変換で保護
    if (isNonFishEntry(cleaned)) {
        return cleaned;
    }

    return spotAliases[cleaned] || cleaned;
}

// ==========================================
// 2. CSV 1行パーサー（ダブルクォート・カンマ対応）
// ==========================================
function parseCsvLine(line) {
    const cols = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            cols.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    cols.push(current);
    return cols;
}

// ==========================================
// 3. 座標マージ＆重複除去ヘルパー
// ==========================================
const stats = {
    processedRows: 0,
    renamedMap: new Map(),
    mergedKeysCount: 0,
    dedupedCoordsCount: 0
};

function recordRename(rawName, normalizedName) {
    if (rawName !== normalizedName) {
        const key = `${rawName} -> ${normalizedName}`;
        stats.renamedMap.set(key, (stats.renamedMap.get(key) || 0) + 1);
    }
}

function ensureFishBucket(resultData, coordTracker, reg, parent, fishName) {
    if (!resultData[reg]) {
        resultData[reg] = {};
        coordTracker[reg] = {};
    }
    if (!resultData[reg][parent]) {
        resultData[reg][parent] = {};
        coordTracker[reg][parent] = {};
    }
    if (!resultData[reg][parent][fishName]) {
        resultData[reg][parent][fishName] = { coords: '' };
        coordTracker[reg][parent][fishName] = new Set();
    }
}

function appendCoord(resultData, coordTracker, reg, parent, fishName, coordString) {
    const coordSet = coordTracker[reg][parent][fishName];
    if (coordSet.has(coordString)) {
        stats.dedupedCoordsCount++;
        return;
    }
    coordSet.add(coordString);

    if (resultData[reg][parent][fishName].coords === '') {
        resultData[reg][parent][fishName].coords = coordString;
    } else {
        resultData[reg][parent][fishName].coords += `|${coordString}`;
    }
}

// ==========================================
// 4. 変換処理（.csv / .json 両対応）
// ==========================================
const resultData = {};
const coordTracker = {};
const inputExt = path.extname(inputPath).toLowerCase();

if (inputExt === '.json') {
    // 既存 *_fish.json を直接クレンジングするモード
    const rawJson = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');
    const sourceData = JSON.parse(rawJson);

    for (const [reg, spots] of Object.entries(sourceData)) {
        if (!spots || typeof spots !== 'object') continue;
        for (const [parent, fishes] of Object.entries(spots)) {
            if (!fishes || typeof fishes !== 'object') continue;
            for (const [rawFishName, info] of Object.entries(fishes)) {
                if (!info || typeof info !== 'object') continue;

                const fishName = normalizeSpotFishName(rawFishName);
                if (!fishName) continue;
                recordRename(rawFishName, fishName);

                const alreadyExists = !!(resultData[reg]?.[parent]?.[fishName]);
                if (alreadyExists) {
                    stats.mergedKeysCount++;
                }

                ensureFishBucket(resultData, coordTracker, reg, parent, fishName);

                const coordsList = String(info.coords || '')
                    .split('|')
                    .map(c => c.trim())
                    .filter(Boolean);

                for (const coordString of coordsList) {
                    stats.processedRows++;
                    appendCoord(resultData, coordTracker, reg, parent, fishName, coordString);
                }

                // coords 以外の拡張プロパティも保持
                for (const [propKey, propVal] of Object.entries(info)) {
                    if (propKey === 'coords') continue;
                    if (resultData[reg][parent][fishName][propKey] === undefined) {
                        resultData[reg][parent][fishName][propKey] = propVal;
                    }
                }
            }
        }
    }
} else {
    // CSV -> JSON 変換モード（従来仕様完全互換＋正規化＆重複除去）
    const csvData = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');
    const lines = csvData.trim().split(/\r?\n/);

    if (lines.length < 2) {
        console.error('❌ エラー: CSVにデータ行がありません。');
        process.exit(1);
    }

    const headers = parseCsvLine(lines[0]).map(h => h.trim());

    const regIdx = headers.indexOf('registration');
    const parentIdx = headers.indexOf('parent');
    const nameIdx = headers.indexOf('name');
    const latIdx = headers.indexOf('lat');
    const lngIdx = headers.indexOf('lng');

    if ([regIdx, parentIdx, nameIdx, latIdx, lngIdx].some(idx => idx === -1)) {
        console.error('❌ エラー: 必須カラム(registration, parent, name, lat, lng)のいずれかが不足しています。');
        process.exit(1);
    }

    // 必須カラム以外の拡張列を抽出
    const extraColumns = [];
    headers.forEach((h, idx) => {
        if (!['registration', 'parent', 'name', 'lat', 'lng'].includes(h)) {
            extraColumns.push({ name: h, index: idx });
        }
    });

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const cols = parseCsvLine(lines[i]);

        const reg = cols[regIdx] ? cols[regIdx].trim() : '';
        const parent = cols[parentIdx] ? cols[parentIdx].trim() : '';
        const rawFishName = cols[nameIdx] ? cols[nameIdx].trim() : '';
        const lat = cols[latIdx] ? cols[latIdx].trim() : '';
        const lng = cols[lngIdx] ? cols[lngIdx].trim() : '';

        if (!reg || !parent || !rawFishName || !lat || !lng) continue;

        const fishName = normalizeSpotFishName(rawFishName);
        if (!fishName) continue;

        stats.processedRows++;
        recordRename(rawFishName, fishName);

        ensureFishBucket(resultData, coordTracker, reg, parent, fishName);

        const coordString = `${lat},${lng}`;
        appendCoord(resultData, coordTracker, reg, parent, fishName, coordString);

        // 拡張列のデータを格納（空欄でなければ追加）
        extraColumns.forEach(ext => {
            const val = cols[ext.index] ? cols[ext.index].trim() : '';
            if (val !== '') {
                if (resultData[reg][parent][fishName][ext.name] === undefined) {
                    resultData[reg][parent][fishName][ext.name] = isNaN(val) ? val : Number(val);
                }
            }
        });
    }
}

// ==========================================
// 5. JSON出力＆サマリーログ
// ==========================================
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(resultData, null, 2), 'utf8');

console.log(`✅ 変換成功: ${inputPath} -> ${outputPath}`);
console.log(`   処理座標数: ${stats.processedRows}件 / 重複座標除去: ${stats.dedupedCoordsCount}件 / 統合魚種キー: ${stats.mergedKeysCount}件`);

if (stats.renamedMap.size > 0) {
    console.log('   正規化内訳:');
    for (const [label, count] of stats.renamedMap.entries()) {
        console.log(`     - ${label} (${count}件)`);
    }
}
