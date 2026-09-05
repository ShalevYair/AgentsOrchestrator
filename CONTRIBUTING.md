# תרומה לפרויקט

מדריך הזה הוא ל**מפתחים** — מי שרוצה לתרום קוד. למי שרק רוצה להתקין ולהשתמש באפליקציה:
[`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md).

## סביבת פיתוח

**דרישות:** Node.js 22 ומעלה, [pnpm](https://pnpm.io) (הגרסה המדויקת נעולה ב-`packageManager` בשורש
`package.json`). **אין** תלות נייטיב שדורשת קומפילציה — לא Visual Studio Build Tools, לא `node-gyp`,
לא בשום פלטפורמה ([ADR-012](docs/DECISIONS.md#adr-012)).

```bash
git clone <repo-url>
cd AgentsOrchestrator
pnpm install
pnpm build       # בונה את כל החבילות בסדר התלויות הנכון
pnpm dev         # מרים שרת + UI במצב פיתוח, עם hot-reload, בפקודה אחת
```

פקודות שימושיות נוספות (כולן רצות משורש המאגר, על כל המונורפו):

| פקודה | מה היא עושה |
|---|---|
| `pnpm typecheck` | `tsc -b` על כל חבילה |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` | Vitest, כל החבילות |
| `pnpm test:coverage` | כנ"ל, עם דוח כיסוי |
| `pnpm eval` | משימות הזהב תחת `evals/` ([`apps/evals`](apps/evals)) |

לפני כל commit, `husky`+`lint-staged` מריצים lint+format אוטומטית על הקבצים המשתנים — commit עם
הפרה נחסם.

## מפת הקוד

```
apps/
  web/        ממשק המשתמש — React + Vite + Tailwind, RTL/i18n מהיום הראשון
  runtime/    שרת Node — API, WebSocket, התמדה (node:sqlite). "שורש ההרכבה" (composition root):
              המקום היחיד שמחבר AppContext קונקרטי (DB, ספק LLM, key store) לראוטים.
  cli/        אריזת ההפעלה בפקודה אחת (`npx agents-orchestrator`, P12-T1) — מאגד את apps/runtime
              וכל packages/* שהוא תלוי בהם לקובץ dist/cli.js יחיד עם esbuild, כי אף חבילת @ao/*
              לא מפורסמת ל-npm. ראו apps/cli/scripts/build.mjs.
  evals/      מסגרת ההערכה — משימות זהב, מדדים, שופט LLM (P11)
packages/
  core/       מנוע התזמור: תוכנית, DAG, מקביליות, Ledger/תקציב, reducers — TS טהור, אפס I/O
  providers/  LLMProvider — מימוש Gemini, אחסון מפתח, מטמון, כיול מודלים
  ingest/     חילוץ קבצים, chunking, RepoMap, אינדקס BM25, ContextBroker
  tools/      הרצה מקומית מבודדת של Python/Node (sandbox לכל פלטפורמה), env-check (P12-T2)
  shared/     טיפוסים וסכמות Zod + היררכיית שגיאות — משותף ל-web ול-runtime
  platform/   תשתית Node-בלבד: קונפיג, לוגים+רדקציה, שכבת paths חוצת-פלטפורמות, רישום סוכנים/מתכונים
agents/       הגדרות סוכנים כקבצים — agent.md + agent.json, בלי קוד (ראו §1 למטה)
recipes/      תבניות תזמור שמורות (YAML)
evals/        משימות הזהב עצמן (cases/) + היסטוריה
docs/         מסמכי אפיון וארכיטקטורה — ראו הבא
```

**חוק שכבות שנשמר בקפידה לאורך כל הפרויקט:** `core`/`platform`/`tools` תלויים רק ב-`@ao/shared`.
`providers` תלוי גם ב-`platform`. `apps/runtime` הוא היחיד שמרכיב הכל יחד. שום חבילה לא תלויה
ב-`apps/*`, חוץ מ-`apps/cli` שתלוי ב-`apps/runtime` בכוונה (הוא עוטף אותו לצורך אריזה, לא הפוך).

## מפת המסמכים

| מסמך | מתי לפתוח |
|---|---|
| 🎯 [`docs/TASKS.md`](docs/TASKS.md) | **תמיד קודם** — תוכנית הביצוע, כללי עבודה, מה כבר נבנה ולמה |
| 🏛️ [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | לפני שכותבים רכיב חדש |
| 📜 [`docs/PROTOCOLS.md`](docs/PROTOCOLS.md) | כשמחברים שני רכיבים — סכמות, חוזים, אירועים |
| 💰 [`docs/BUDGET.md`](docs/BUDGET.md) | כשנוגעים בטוקנים או בעלות |
| 🎨 [`docs/UX.md`](docs/UX.md) | כשבונים UI |
| 🤔 [`docs/DECISIONS.md`](docs/DECISIONS.md) | כשמשהו לא ברור, או לפני שסוטים מהחלטה קיימת |
| 🧩 [`docs/EXTENDING.md`](docs/EXTENDING.md) | **הוספת יכולת חדשה בלי לגעת ב-`packages/core`** — ראו §1 למטה |
| 📊 [`docs/TELEMETRY.md`](docs/TELEMETRY.md) | בדיוק מה נאסף (ומה לעולם לא), אם וכשמישהו מפעיל את הטלמטריה האופציונלית |
| 📦 [`RELEASING.md`](RELEASING.md) / [`CHANGELOG.md`](CHANGELOG.md) | רק למי שמריץ שחרור גרסה בפועל — לא חלק מזרימת הפיתוח הרגילה |

## איך מוסיפים רכיב

הפרויקט בנוי כך שרוב ההרחבות הן **קבצי הגדרה, לא קוד** — [`docs/EXTENDING.md`](docs/EXTENDING.md)
הוא המדריך המלא, עם דוגמאות עובדות לכל אחד מהארבעה:

1. **סוג סוכן חדש** — תיקייה חדשה תחת `agents/<type>/` עם `agent.json`+`agent.md`. אפס שינוי קוד.
   ⚠️ שימו לב: רק סוכנים שהפלט שלהם NDJSON חופשי-צורה (בסגנון `reader`/`analyst`/`coder`/`writer`/
   `critic`/`synthesizer`) מתאימים למנגנון הזה — חמישה תפקידים פנימיים נוספים (`recon`/`planner`/
   `checkpoint`/`outliner`/`toolsmith`) מקודדים בכוונה בקוד כי הם מפיקים אובייקט JSON יחיד, לא
   NDJSON — הפירוט המלא ב-[`TASKS.md` P10-T3](docs/TASKS.md#p10).
2. **מתכון חדש** (תבנית תזמור מוכנה) — קובץ YAML תחת `recipes/`.
3. **reducer חדש** (מיזוג דטרמיניסטי של פלטי סוכנים) — רישום דרך ה-registry הניתן להרחבה.
4. **כלי מקומי חדש** — כלי חד-פעמי (הנתיב הגמיש, מומלץ) או תוספת לספריית הכלים המוכנים-מראש.

לרכיב שאינו אחד מהארבעה (שינוי בליבת התזמור, בפרוטוקולים, ב-UI) — קראו קודם את
[`ARCHITECTURE.md`](docs/ARCHITECTURE.md)/[`PROTOCOLS.md`](docs/PROTOCOLS.md) הרלוונטיים, ופתחו
דיון (issue) לפני קוד אם משהו לא ברור.

## בדיקות

- **Vitest** ליחידה/אינטגרציה, **Playwright** ל-E2E על ה-UI.
- **אפס טוקנים בבדיקות יחידה** — כל קריאת LLM עוברת `MockLLMProvider` (`@ao/providers`). בדיקות
  שכן נוגעות ברשת אמיתית (כמו `discoverPython`'s "real integration smoke test") מסומנות ככאלה
  בשם ה-`describe` ומוצדקות בהערה — לא הופתעות.
- כל חבילה חדשה מקבלת `vitest.config.ts` משלה עם `include: ["src/**/*.test.ts"]` — בלעדיו, קובץ
  `.test.js` שנוצר ע"י `tsc -b` לתוך `dist/` ירוץ **גם הוא**, וכל בדיקה תרוץ פעמיים.

## זרימת עבודה ו-PR

הפרויקט מנוהל שלב-אחר-שלב לפי [`docs/TASKS.md`](docs/TASKS.md) — קראו את "כללי העבודה" בראש הקובץ
לפני ה-PR הראשון. בקיצור:

1. **שלב אחד = PR אחד.** לא מתחילים משימה לפני שהקודמת עומדת ב"הגדרת גמור" שלה.
2. **סימון תוך כדי** — `[x]` בתיבת הסימון + עדכון טבלת ההתקדמות באותו commit של הקוד.
3. **חוזה לפני מימוש** — נוגעים בגבול בין רכיבים? `PROTOCOLS.md` קודם, קוד אחר כך.
4. **בדיקות בתוך המשימה**, לא כמשימה נפרדת אחר כך.
5. **🪟 Windows הוא יעד מדרגה ראשונה** ([ADR-011](docs/DECISIONS.md#adr-011)) — CI רץ על שלוש
   הפלטפורמות בכל PR; כשל ב-Windows חוסם מיזוג בדיוק כמו בלינוקס.

`git commit`/`push` עוברים דרך husky — הפרת lint/format נחסמת לפני שהיא מגיעה ל-PR בכלל.
