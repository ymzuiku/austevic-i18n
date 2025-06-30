#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import OpenAI from "openai";

if (!process.env.OPENAI_CLIENT) {
	throw new Error("OPENAI_CLIENT is not set");
}

const {
	values: { outdir, lang, prompt },
} = parseArgs({
	options: {
		outdir: { type: "string", short: "o", default: "./i18n" },
		lang: { type: "string", short: "l", default: "en,zh,ja,es,fr,hi" },
		prompt: { type: "string", short: "p", default: "" },
	},
});

if (!outdir) {
	console.error(
		"Please provide a output directory for the i18n, like: -o ./i18n",
	);
	process.exit(1);
}

const availableLanguages: Record<string, string> = {
	en: "English",
	zh: "中文",
	ja: "日本語",
	es: "Español",
	fr: "Français",
	hi: "Hindi",
	de: "Deutsch",
	ru: "Русский",
	pt: "Português",
	it: "Italiano",
	ko: "한국어",
	tr: "Türkçe",
	vi: "Tiếng Việt",
	th: "ไทย",
	id: "Bahasa Indonesia",
	ar: "العربية",
	pl: "Polski",
	nl: "Nederlands",
	sv: "Svenska",
	uk: "Українська",
};

const inputLangs = lang
	.split(",")
	.map((v) => v.trim())
	.filter(Boolean);

for (const code of inputLangs) {
	if (!(code in availableLanguages)) {
		throw new Error(`Unknown language code: "${code}"`);
	}
}

const langsCode =
	`const langs: Record<string, string> = {\n` +
	inputLangs.map((code) => `\t${code}: "${code}",`).join("\n") +
	`\n};`;

const languageListCode =
	`export const languageList = [\n` +
	inputLangs
		.map(
			(code) => `\t{ value: "${code}", label: "${availableLanguages[code]}" },`,
		)
		.join("\n") +
	`\n];`;

console.log(
	"will auto translate langs code to: ",
	languageListCode.replace(/export const languageList = /, ""),
);

const tableName = "i18n";
const outfile = `${outdir}/i18n-source.ts`;
const outIndexFile = `${outdir}/index.ts`;
const typeRegx = /(\.(ts|tsx))/;
const ignoreDir = {
	".git": true,
	node_modules: true,
	dist: true,
	public: true,
	assets: true,
	".husky": true,
	drizzle: true,
	prisma: true,
	".vscode": true,
	".idea": true,
};

const addPrompt = prompt || process.env.I18N_AI_PROMPT || "";

fs.existsSync(outdir) || fs.mkdirSync(outdir, { recursive: true });

const i18nIndex = `
import { i18nSource } from "./i18n-source";

let lastLang = "";
${langsCode}
${languageListCode}

const nofound = {
	zh: " ",
	en: " ",
	ja: " ",
	es: " ",
	fr: " ",
	hi: " ",
};
export const getLanguage = () => {
	if (typeof window === "undefined") {
		return "en";
	}
	if (lastLang) {
		return lastLang;
	}
	let lng = localStorage.getItem("lang");
	if (!lng) {
		lng = (navigator.language || navigator.language).slice(0, 2).toLowerCase();
	}

	lastLang = langs[lng] || "en";
	return lastLang;
};

function template(
	strings: TemplateStringsArray,
	values: (string | number)[],
): string {
	let result = "";
	for (let i = 0; i < strings.length; i++) {
		result += strings[i];
		if (i < values.length) {
			result += values[i];
		}
	}
	return result;
}

export function i18nKey(text: string): string {
	return text;
}

type I18nMap = Record<string, Record<string, string>>;

export function i18n(
		strings: TemplateStringsArray,
		...values: (string | number)[]
	): string {
	const result = template(strings, values);
	const source = (i18nSource as I18nMap)[result];
	if (!source) {
		return result;
	}
	return source[getLanguage()];
}

export const i18nSourceIdMap: Record<string, number> = {};
export const i18nSourceIdList: Record<string, string>[] = [];

const keys = Object.keys(i18nSource);
for (let i = 0; i < keys.length; i++) {
	const key = keys[i];
	i18nSourceIdMap[key] = i;
	i18nSourceIdList.push((i18nSource as I18nMap)[key]);
}

export function i18nId(
	strings: TemplateStringsArray,
	...values: (string | number)[]
): number {
	const result = template(strings, values);
	return (i18nSourceIdMap as Record<string, number>)[result] || 0;
}

export function i18nFromKey(key: string) {
	const obj = (i18nSource as I18nMap)[key];
	if (!obj) {
		return key;
	}
	return obj[getLanguage()];
}

export function i18nObj(
	strings: TemplateStringsArray,
	...values: (string | number)[]
): Record<string, string> {
	const result = template(strings, values);
	return (i18nSource as I18nMap)[result] || nofound;
}

export function setLanguage(lng: "zh" | "en" | "jp" | "es") {
	if (typeof window === "undefined") {
		return;
	}
	lastLang = lng;
	localStorage.setItem("lang", lng);
	location.reload();
}

export function replaceI18n(str: string, obj: Record<string, unknown>) {
	if (str === void 0) {
		return "[replace-i18n string is undefined]";
	}
	if (typeof obj !== "object") {
		return "[replace-i18n data is not object]";
	}
	return str.replace(/{(\\w*)}/g, (_, p1 = "") => {
		// biome-ignore lint/suspicious/noPrototypeBuiltins: <explanation>
		return obj.hasOwnProperty(p1) ? (obj[p1] as string) : \`[Not found: \${p1}]\`;
	});
}

`;

const aiPrompt = (text: string) => {
	return `Translate the following text into English, Spanish, Chinese, French, Hindi, and Japanese. Ensure the translation is concise, professional, elegant, and suitable for a UI-friendly commercial context. Your output should be in JSON format: {"en": "Hello, {name}", "es": "Hola, {name}", "zh": "你好, {name}", "fr": "Bonjour, {name}", "hi": "नमस्ते, {name}", "ja": "こんにちは, {name}"} Please respond only in this JSON format. ${addPrompt} Please translate: ${text}`;
};
// 更好的处理gpt吐出的一些不规则的json对象
function parseJsonText(jsonString: string) {
	let openBraceIndex = -1;
	let closeBraceIndex = -1;

	for (let i = 0; i < jsonString.length; i++) {
		if (jsonString[i] === "{" && openBraceIndex === -1) {
			openBraceIndex = i;
		} else if (jsonString[i] === "}") {
			closeBraceIndex = i;
		}
	}

	if (openBraceIndex !== -1 && closeBraceIndex !== -1) {
		const extractedJsonString = jsonString.slice(
			openBraceIndex,
			closeBraceIndex + 1,
		);
		try {
			const extractedJson = JSON.parse(extractedJsonString);
			return extractedJson;
		} catch (_error) {
			return null;
		}
	} else {
		return null;
	}
}

const openai = new OpenAI({
	apiKey: process.env.OPENAI_CLIENT,
});

const matchI18n = (content: string): Set<string> => {
	const result = new Set<string>();
	const reg = [
		/i18n\((`[^`]+`|'[^']+'|"[^"]+")\)/g,
		/i18n\(\s*("([^"]*)"|'([^']*)'|`([^`]*)`)\s*\)/gs,
		/i18n\(\s*("([^"]*)"|'([^']*)'|`([^`]*)`)\s*,?\s*\)/gs,
		/i18nId\((`[^`]+`|'[^']+'|"[^"]+")\)/g,
		/i18nKey\((`[^`]+`|'[^']+'|"[^"]+")\)/g,
		/i18nKey\(\s*("([^"]*)"|'([^']*)'|`([^`]*)`)\s*\)/gs,
		/i18nKey\(\s*("([^"]*)"|'([^']*)'|`([^`]*)`)\s*,?\s*\)/gs,
		/i18nObj\((`[^`]+`|'[^']+'|"[^"]+")\)/g,
		/i18nObj\(\s*("([^"]*)"|'([^']*)'|`([^`]*)`)\s*\)/gs,
		/i18nObj\(\s*("([^"]*)"|'([^']*)'|`([^`]*)`)\s*,?\s*\)/gs,
		/i18n(`[^`]+`)/g,
		/i18nId(`[^`]+`)/g,
		/i18nObj(`[^`]+`)/g,
	];
	reg.forEach((r) => {
		let match = null;
		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		while ((match = r.exec(content))) {
			const key = match[1]?.slice(1, -1);
			if (key) {
				result.add(key);
			}
		}
	});
	return result;
};

// 递归遍历目录并查找匹配的文本
function findI18nTextInDirectory(dirPath: string, resultArray: string[]) {
	const files = fs.readdirSync(dirPath);

	for (let i = 0; i < files.length; i++) {
		const file = files[i] as string;
		if (ignoreDir[file as "node_modules"]) {
			continue;
		}
		const filePath = path.join(dirPath, file);

		if (fs.statSync(filePath).isDirectory()) {
			// 如果是目录，递归处理
			findI18nTextInDirectory(filePath, resultArray);
		} else {
			if (!typeRegx.test(filePath)) {
				continue;
			}
			// 如果是文件，读取文件内容并查找匹配的文本
			const fileContent = fs.readFileSync(filePath, "utf8");
			for (const key of matchI18n(fileContent)) {
				resultArray.push(key);
			}
		}
	}
}

type LanguageMap = { zh: string; en: string; jp: string; es: string };

async function insertKv(db: Database, k: string, v: string) {
	return db
		.query(`insert into ${tableName} (k, v) values ($k, $v)`)
		.values({ $k: k, $v: v });
}

async function loadI18nTexts() {
	const texts: string[] = [];
	findI18nTextInDirectory("./", texts);
	return Array.from(new Set(texts));
}

async function start(texts: string[]) {
	const db = new Database(path.join(outdir, "i18n.sqlite"), { create: true });
	await db
		.query(
			`
CREATE TABLE IF NOT Exists ${tableName} (
  k TEXT PRIMARY KEY,
  v TEXT
);
`,
		)
		.run();

	const out: Record<string, LanguageMap> = {};
	for (let i = 0; i < texts.length; i++) {
		const text = texts[i] as string;
		const old = (await db
			.query(`select * from ${tableName} where k = $text`)
			.get({ $text: text })) as {
			k: string;
			v: string;
		};

		if (!old) {
			console.log("translate new:", text);
			const completion = await openai.chat.completions.create({
				messages: [{ role: "user", content: aiPrompt(text) }],
				model: "gpt-4o-mini",
			});
			const msg = completion.choices[0]?.message.content;
			try {
				if (!msg) {
					console.log("openai error, not msg:", text, msg);
					continue;
				}
				const obj = parseJsonText(msg);
				if (!obj) {
					throw new Error(`openai parse error:${msg}`);
				}
				out[text] = obj as LanguageMap;
				await insertKv(db, text, JSON.stringify(out[text]));
			} catch (err) {
				console.log("openai error, parse error:", text, msg, err);
			}
		} else {
			out[text] = JSON.parse(old.v);
		}
	}

	return out;
}

async function pipe() {
	let texts = await loadI18nTexts();
	if (texts.length === 0) {
		texts = ["hello"];
	}
	const out = await start(texts);
	fs.writeFileSync(
		outfile,
		`
		export const i18nSource = ${JSON.stringify(out)}
	`,
	);
	fs.writeFileSync(outIndexFile, i18nIndex);
	console.log("Auto i18n sentences: ", Object.keys(out).length);
	Bun.spawnSync(["bunx", "prettier", outdir, "--write"]);
}

pipe();
