import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { set } from 'lodash';

const TARGET_XLSX = path.join(__dirname, 'locale.xlsx');
const LOCALES_DIR = path.join(__dirname, 'locales');

function flatten(obj: any, prefix = '', result: any = {}) {
  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      flatten(value, newKey, result);
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

function readLocaleFile(filePath: string) {
  try {
    return filePath.endsWith('.json')
      ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      : require(filePath);
  } catch (err) {
    console.error(`❌ 读取文件失败：${filePath}`, err);
    return {};
  }
}

// Excel → JS/JSON
function convertXlsxToLocales() {
  const workbook = XLSX.readFile(TARGET_XLSX);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

  const locales: Record<string, any> = {};
  for (const row of jsonData) {
    const key = row['key'];
    if (!key) continue;
    for (const [lang, value] of Object.entries(row)) {
      if (lang === 'key') continue;
      locales[lang] = locales[lang] || {};
      set(locales[lang], key, value);
    }
  }

  fs.mkdirSync(LOCALES_DIR, { recursive: true });

  for (const [lang, data] of Object.entries(locales)) {
    const jsonFile = path.join(LOCALES_DIR, `${lang}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2), 'utf-8');

    const varName = lang.replace(/-/g, '');
    const jsContent = `const ${varName} = ${JSON.stringify(data, null, 2)};\nmodule.exports = ${varName};\n`;
    const jsFile = path.join(LOCALES_DIR, `${lang}.js`);
    fs.writeFileSync(jsFile, jsContent, 'utf-8');

    console.log(`✅ 已生成文件：${lang}.json, ${lang}.js`);
  }
}

// JS/JSON → Excel
function convertLocalesToXlsx() {
  const files = fs.readdirSync(LOCALES_DIR).filter(f => /\.(json|js)$/.test(f));
  const langData: Record<string, Record<string, string>> = {};

  for (const file of files) {
    const lang = path.basename(file, path.extname(file));
    const filePath = path.join(LOCALES_DIR, file);
    langData[lang] = flatten(readLocaleFile(filePath));
  }

  const allKeys = Array.from(new Set(Object.values(langData).flatMap(Object.keys)));
  const rows = allKeys.map(key => {
    const row: any = { key };
    for (const lang of Object.keys(langData)) {
      row[lang] = langData[lang][key] || '';
    }
    return row;
  });

  // 空值优先排序
  rows.sort((a, b) => {
    const aEmpty = Object.values(a).some((v, k) => String(k) !== 'key' && v === '');
    const bEmpty = Object.values(b).some((v, k) => String(k) !== 'key' && v === '');
    return Number(bEmpty) - Number(aEmpty);
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'i18n');
  XLSX.writeFile(workbook, TARGET_XLSX);

  console.log(`✅ 导出完成：${TARGET_XLSX}`);
}

// 主流程控制
function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--to-js') ? 'to-js' :
               args.includes('--to-excel') ? 'to-excel' : null;

  if (!mode) {
    console.error('请使用参数 --to-js 或 --to-excel');
    process.exit(1);
  }

  try {
    switch (mode) {
      case 'to-js':
        convertXlsxToLocales();
        break;
      case 'to-excel':
        convertLocalesToXlsx();
        break;
    }
  } catch (err) {
    console.error('运行出错：', err);
    process.exit(1);
  }
}

main();
