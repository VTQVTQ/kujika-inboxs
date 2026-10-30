import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/** Ký hiệu được phép viết thẳng trong JSX (không phải chữ cần dịch) */
const ALLOWED_SYMBOLS = ["·", "–", "—", "/", ".", "→", "✕", "↑", "↓", "!", "…", "‹", "›", "×", "+", "−", "%", "(", ")", ":", "«", "»", "▲", "▼", "↕", "↗"];

const config = [
  { ignores: [".next/**", "node_modules/**", "db/migrations/**", "public/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Tham số / biến bắt đầu bằng "_" là cố ý không dùng
    rules: { "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] },
  },
  {
    // server.js chạy trực tiếp bằng Node (CommonJS)
    files: ["server.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // i18n: chữ hiển thị trong JSX phải lấy từ messages/*.json qua useTranslations / getTranslations
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true, allowedStrings: ALLOWED_SYMBOLS }],
    },
  },
];

export default config;
