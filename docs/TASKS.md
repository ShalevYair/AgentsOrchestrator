# תוכנית ביצוע

> **זו נקודת הכניסה לעבודה על [AgentsOrchestrator](../README.md).**
> רקע: [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`PROTOCOLS.md`](PROTOCOLS.md) · [`BUDGET.md`](BUDGET.md) · [`UX.md`](UX.md) · [`DECISIONS.md`](DECISIONS.md)

---

## כללי עבודה — לקרוא לפני המשימה הראשונה

1. **שלב אחד = PR אחד.** לא מתחילים שלב לפני שהקודם עומד ב"הגדרת גמור" שלו.
2. **סימון תוך כדי.** מסמנים `[x]` ומעדכנים את [טבלת ההתקדמות](#טבלת-התקדמות) באותו commit של הקוד.
3. **חוזה לפני מימוש.** נוגעים בגבול בין רכיבים? קודם [`PROTOCOLS.md`](PROTOCOLS.md), אחר כך קוד.
4. **האפליקציה רצה בסוף כל שלב.** אין שלב שמשאיר את המערכת שבורה. לכל שלב יש הדגמה.
5. **בדיקות בתוך המשימה,** לא כמשימה נפרדת אחר כך. "גמור" כולל בדיקות.
6. **אפס טוקנים בבדיקות יחידה.** קריאות LLM עוברות מוק. בדיקות שנוגעות ברשת מסומנות ורצות בנפרד.
7. **שינוי החלטה** → מעדכנים [`DECISIONS.md`](DECISIONS.md) קודם, ומוסיפים כאן את המשימות שנוצרו.
8. **הערכות הן סדרי גודל,** לא התחייבות. `S` ≈ יום · `M` ≈ 2–3 ימים · `L` ≈ שבוע.
9. **🪟 Windows הוא יעד מדרגה ראשונה** ([ADR-011](DECISIONS.md#adr-011)). ה-CI רץ על Windows מ-P0 ובכל PR.
   משימה **לא** "גמורה" אם היא ירוקה בלינוקס ואדומה ב-Windows. אין תלות נייטיב שדורשת קומפילציה
   ([ADR-012](DECISIONS.md#adr-012)).

**מזהי משימות** (`P3-T2`) יציבים — אפשר להפנות אליהם מ-commit, מ-issue ומ-PR.

---

## טבלת התקדמות

| שלב | נושא | גודל | תלוי ב- | מצב |
|---|---|---|---|---|
| [P0](#p0) | יסודות ותשתית 🪟 | M | — | ✅ |
| [P1](#p1) | ספק Gemini + ניהול מפתח 🪟 | M | P0 | ✅ |
| [P2](#p2) | 🏁 שלד הליכה — צ'אט E2E 🪟 | M | P1 | ✅ |
| [P3](#p3) | קליטה ו-ArtifactStore | L | P0 | ✅ |
| [P4](#p4) | Ledger ומנוע התקציב | M | P1 | ✅ |
| [P5](#p5) | 🏁 ליבת התזמור | L | P2,P3,P4 | ✅ |
| [P6](#p6) | צ'קפוינטים ותכנון אדפטיבי | M | P5 | ✅ |
| [P7](#p7) | כלים מקומיים (toolsmith) 🪟 | M | P3,P5 | ✅ |
| [P8](#p8) | פלט גדול וארטיפקטים 🪟 | L | P5 | ✅ |
| [P9](#p9) | 🏁 ממשק תזמור מלא | L | P5,P6,P8 | ⬜ |
| [P10](#p10) | מתכונים ורישום סוכנים | M | P5,P6 | ⬜ |
| [P11](#p11) | Evals והקשחה | L | P9 | ⬜ |
| [P12](#p12) | אריזה ו-DX 🪟 | M | P11 | ⬜ |

🏁 = אבן דרך להדגמה

🪟 = מכיל משימות קריטיות ל-Windows

**מסלול קריטי:** `P0 → P1 → P2 → P4 → P5 → P6 → P9`
**ניתן להקבלה:** P3 מ-P0 · P7 אחרי P3+P5 · P8 אחרי P5 · P10 אחרי P6

**שלוש אבני הדרך:**
- **M1 (סוף P2)** — צ'אט עובד מקצה לקצה עם סוכן אחד, **ירוק ב-CI על Windows**. *מוכיח שהצינור חי.*
- **M2 (סוף P5)** — תזמור אמיתי: תכנון, fan-out מקבילי, מיזוג מקומי, בתקציב. *מוכיח שהרעיון עובד.*
- **M3 (סוף P9)** — המוצר. *מוכיח שאפשר להשתמש בו.*

---

<a name="p0"></a>
## P0 · יסודות ותשתית `M`

**מטרה:** שלד שאפשר לבנות עליו 12 שלבים בלי לחזור אחורה.

- [x] **P0-T1 · מונורפו** — pnpm workspaces לפי המבנה ב-[README](../README.md#מבנה-הקוד-המתוכנן).
      **אילוץ: אפס תלויות נייטיב שדורשות קומפילציה** ([ADR-012](DECISIONS.md#adr-012)).
      *גמור:* `pnpm install` עובד מנקי **על Windows בלי Visual Studio Build Tools** · `pnpm -r build` עובר ·
      חבילה מייבאת חבילה אחרת · בדיקת CI שנכשלת אם נכנסה תלות עם `install`/`node-gyp` בסקריפטים.
- [x] **P0-T2 · TypeScript** — `strict: true`, `noUncheckedIndexedAccess`, project references, ESM.
      *גמור:* `pnpm typecheck` נקי · `any` מרומז נכשל בבנייה.
- [x] **P0-T3 · איכות קוד** — ESLint + Prettier + husky + lint-staged.
      *גמור:* commit עם הפרה נחסם · `pnpm lint` נקי.
- [x] **P0-T4 · בדיקות** — Vitest, coverage, `pnpm test` בשורש.
      *גמור:* בדיקה לדוגמה בכל חבילה · coverage מדווח.
- [x] **P0-T5 · CI במטריצת פלטפורמות** 🪟 — GitHub Actions: typecheck + lint + test + build,
      במטריצה **`windows-latest` + `macos-latest` + `ubuntu-latest`**, על כל PR. **מ-P0, לא מ-P12.**
      *גמור:* שלוש הפלטפורמות ירוקות · באג מוזרק מפיל את כולן · **כשל ב-Windows חוסם מיזוג בדיוק כמו בלינוקס**.
      *הערה:* במאגר פרטי דקות Windows נצרכות בתעריף כפול. אם המכסה נהיית בעיה — Windows על PR בלבד
      (לא על כל push), אך **לעולם לא מבוטל**.
- [x] **P0-T6 · קונפיג** — סכמת Zod אחת לכל ההגדרות. סדר: ברירות מחדל → קובץ → env → UI.
      *גמור:* קונפיג לא תקין נכשל בעלייה עם הודעה מדויקת · `config.example.jsonc` מתועד.
- [x] **P0-T7 · לוגים** — `pino` מובנה, רמות, מזהה ריצה, **רדקציה כברירת מחדל**.
      *גמור:* מפתח API לא מופיע בלוגים בשום רמה · יש בדיקה שמוכיחה את זה.
- [x] **P0-T8 · שגיאות** — היררכיית שגיאות עם קודים, `recoverable`, וסריאליזציה ל-UI.
      *גמור:* כל שגיאה נושאת קוד יציב · מיפוי קוד→הודעת משתמש קיים.
- [x] **P0-T9 · סכמות משותפות** — `packages/shared` עם כל הסכמות מ-[`PROTOCOLS.md`](PROTOCOLS.md) ב-Zod.
      *גמור:* הטיפוסים נגזרים ב-`z.infer` · JSON Schema תקין נוצר מאותה הגדרה · בדיקות round-trip.
      ⚠️ **בפועל:** `zod-to-json-schema` (חבילת צד ג') מייצר סכמה **ריקה** מול Zod v4 — לא מתוחזק לגרסה
      הזאת. הוחלף ב-`z.toJSONSchema()` הילידי של Zod v4 (`packages/shared/src/schemas/json-schema.ts`).
      התאמה לדיאלקט הספציפי של Gemini (`$schema`, `nullable`) נשארת ל-[P1-T2](#p1).
- [x] **P0-T10 · משמעת חוצת-פלטפורמות** 🪟 — שכבת `paths` יחידה שכל הקוד עובר דרכה:
      `node:path` בלבד (אפס שרשור מחרוזות) · השוואת נתיבים **מנורמלת-רישיות** (Windows ו-macOS לא
      רגישים לרישיות — כלא נתיבים תמים ניתן לעקיפה) · `.gitattributes` שמקבע LF במאגר ·
      אזהרה על נתיב מעל 240 תווים · גילוי פייתון (`py -3` / `python3` / `python`) · אין הנחת shell.
      *גמור:* בדיקות יחידה לכלא הנתיבים **רצות בשלוש הפלטפורמות** · ניסיון עקיפה ברישיות שונות נחסם ·
      אין `\\` או `/` קשיח באף מודול.

> **הגדרת גמור לשלב:** `pnpm install && pnpm -r build && pnpm test` עובר על מכונה נקייה
> **בשלוש הפלטפורמות**, כולל Windows ללא כלי בנייה מותקנים.

---

<a name="p1"></a>
## P1 · ספק Gemini + ניהול מפתח `M`

**מטרה:** לדבר עם Gemini באמינות, ולדעת בדיוק כמה זה עולה.

- [x] **P1-T1 · ממשק `LLMProvider`** — לפי [`ARCHITECTURE.md` §7](ARCHITECTURE.md#7-שכבת-הספק-gemini).
      *גמור:* `packages/core` לא מייבא כלום מ-`providers` · מימוש מוק מלא לבדיקות.
      *כפי שמומש:* הממשק והטיפוסים הנלווים (`GenerateRequest`, `Delta`, `CacheableContent`, `CacheRef`,
      `CountRequest`) יושבים ב-`packages/shared/src/provider/llm-provider.ts` ולא ב-`packages/providers` —
      זו הפרשנות שנבחרה ל"`core` תלוי רק בחוזה המופשט, לעולם לא בספק הקונקרטי": `shared` הוא כבר הבסיס
      שכל חבילה תלויה בו, כך של-`core` (P4/P5) יש גישה ל-`LLMProvider` בלי תלות ב-`@ao/providers` בכלל.
      `MockLLMProvider` (`packages/providers/src/mock/mock-provider.ts`) הוא מימוש מלא ומוגדר-תרחישים
      (תגובות קבועות/פונקציה, streaming מפוצל, ספירת קריאות) לשימוש בבדיקות של שלבים עתידיים.
- [x] **P1-T2 · מימוש Gemini** — `generate` בסטרימינג, `countTokens`, `models`.
      *גמור:* קריאה אמיתית מחזירה טקסט · הסטרימינג מניב deltas · `usageMetadata` נקלט מלא.
      *כפי שמומש:* `GeminiProvider` (`packages/providers/src/gemini/`) עוטף `@google/genai@2.20.0`.
      ⚠️ **אין `GEMINI_API_KEY` בסביבה הזו** — לא בוצעה קריאה אמיתית לרשת; כל הבדיקות רצות מול SDK מוקי
      (`GeminiSdkClient` — ממשק מבני צר, לא טיפוסי ה-SDK עצמם). מתאם ה-`responseSchema` לדיאלקט של Gemini
      (`schema-dialect.ts`) אומת מול טיפוס ה-`Schema` האמיתי שב-`node_modules/@google/genai` וגם הורץ בפועל
      נגד `PlanSchema`/`TaskUnderstandingSchema`/`CheckpointDecisionSchema` — ראה הערות מפורטות בראש הקובץ.
- [x] **P1-T3 · אחסון מפתח** 🪟 — **`@napi-rs/keyring`** (לא `keytar`): מגיע עם binaries מוכנים
      ל-`win32-x64` / `ia32` / `arm64-msvc`, ולכן **אין קומפילציה ואין צורך ב-Build Tools**.
      ב-Windows הוא נשען על Credential Manager, ב-macOS על Keychain, בלינוקס על Secret Service.
      בנפילה: קובץ AES-GCM עם מפתח נגזר-מכונה. הנימוק: [ADR-012](DECISIONS.md#adr-012).
      *גמור:* עובד בשלוש הפלטפורמות ב-CI · המפתח לא ב-`localStorage`, לא בלוגים, לא בייצוא ·
      החלפה ומחיקה עובדות · בדיקה למסלול הנפילה (לינוקס ללא Secret Service).
      *כפי שמומש:* `createKeyStore` (`packages/providers/src/keyring/`) עם נפילה עצמית (self-healing) —
      כל קריאה מנסה קודם את ה-keyring, ועל כשל עוברת לקובץ המוצפן. **מסלול הנפילה נבדק באמת, לא רק
      במוק**: בסביבת הריצה הזו (לינוקס ללא Secret Service) קריאה אמיתית ל-`@napi-rs/keyring` זורקת
      `AccessDenied` בפועל — אומת ישירות — ובדיקת האינטגרציה `key-store.test.ts` רצה נגד המימוש האמיתי
      ומוכיחה שהנפילה לקובץ ה-AES-GCM עובדת מקצה לקצה.
- [x] **P1-T4 · אימות מפתח** — בדיקה חיה מול `models.list` בהכנסה ובעלייה.
      *גמור:* מפתח שגוי מקבל הודעה ברורה, לא stack trace.
      *כפי שמומש:* `validateApiKey` (`packages/providers/src/validation/validate-key.ts`) — כל כשל
      (רשת, 401/403, קטלוג ריק) עוטף ל-`ProviderKeyError` הקיים; ה-`userMessage` תמיד הטקסט הקבוע
      מ-`ERROR_MESSAGES`, לעולם לא ה-stack trace הגולמי.
- [x] **P1-T5 · חוסן** — ניסיון חוזר עם exponential backoff + jitter על 429/5xx, כיבוד `Retry-After`,
      מגבל קצב, ומושכות מקביליות גלובליות.
      *גמור:* בדיקה מדמה 429 ומאמתת עיתוי · חריגת מקביליות בלתי אפשרית.
      *כפי שמומש:* `withRetry` (backoff מעריכי + jitter מלא, `retry.ts`), `RateLimiter` (token bucket,
      `rate-limiter.ts`), `ConcurrencyLimiter` (סמפור, `concurrency-limiter.ts`) — כולם כלליים ולא תלויי-Gemini,
      ו-`GeminiProvider` מרכיב אותם. `Retry-After`/`RetryInfo.retryDelay` מחולץ מגוף הודעת השגיאה (ה-SDK לא
      חושף כותרות HTTP ב-`ApiError` הציבורי שלו — אומת מול הטיפוסים המותקנים).
- [x] **P1-T6 · מטמון תגובות** — לפי hash של `(model, params, prompt)`, TTL, ניתן לכיבוי.
      *גמור:* קריאה זהה שנייה לא יוצאת לרשת · פגיעות מטמון נספרות ומדווחות.
      *כפי שמומש:* `ResponseCache` (`packages/providers/src/cache/response-cache.ts`) — `GeminiProvider`
      שומר את כל רצף ה-deltas של קריאת `generate` ומשחזר אותו במלואו בפגיעה, כולל בסטרימינג.
- [x] **P1-T7 · רישום מודלים** ⚠️ — **טבלה אחת** (`packages/providers/models.ts`): מזהה, תקרות, מחירים,
      יכולות, שכבה. אימות מול `models.list` בעלייה. בחירת `tier.cheap` **דינמית** ([Q5](DECISIONS.md#q5--שכבת-ה-cheap--איזה-מודל)).
      *גמור:* אין מזהה מודל קשיח מחוץ לטבלה · מודל שנעלם מייצר אזהרה + נפילה לחלופה · המחירים מאומתים מול התיעוד ומתוארכים.
      *כפי שמומש:* הטבלה יושבת ב-`packages/providers/src/models.ts` (לא ישירות תחת `packages/providers/`) —
      כדי לשמור על המוסכמה הקיימת מ-P0 (`rootDir: src`, סריקת ESLint/Vitest מוגבלת ל-`src/**`); זו החלטת
      עקביות, לא סטייה מהכוונה. `gemini-3.7-flash` מאומת (מופיע ב-union הטיפוסים של ה-SDK המותקן ובחיפוש
      רשת חי) ב-$0.75/$3.75 למיליון (מבצע עד 2026-12-31). `tier.cheap` נבחר **דינמית** ב-`selectCheapModel`
      מתוך קטלוג חי, ונופל בחן ל-alias המתגלגל `gemini-flash-lite-latest` כשאין קטלוג חי — כפי שקורה
      בפועל בסביבה הזו (אין `GEMINI_API_KEY`). ⚠️ `ai.google.dev` ו-`googleapis.github.io` חסומים ע"י
      ה-proxy של הסביבה — האימות בפועל נעשה מול הטיפוסים המותקנים בפועל של `@google/genai` וחיפושי רשת,
      לא מול התיעוד הרשמי ישירות. פירוט מלא בהערת התיעוד בראש `models.ts`.
- [x] **P1-T8 · Context caching** — יצירה, שימוש חוזר, ופקיעה של `Contract Block`.
      *גמור:* N קריאות עם אותו prefix מייצרות מטמון אחד · החיסכון מדיד ומדווח.
      *כפי שמומש:* `ContractCache` (`packages/providers/src/context-cache/contract-cache.ts`) — מדדד גם
      יצירות בו-זמניות (in-flight dedup), לא רק רצף סדרתי, כי fan-out אמיתי קורא ל-`getOrCreate` במקביל.
- [x] **P1-T9 · רדקציית סודות** — סריקה (תבניות + אנטרופיה) על כל מטען יוצא.
      *גמור:* מפתחות AWS/GCP/OpenAI/פרטיים ותוכן `.env` נתפסים · אפס false-negative בקורפוס הבדיקה · כל החלפה נרשמת.
      *כפי שמומש:* `redactPayload` (`packages/providers/src/egress/redact-payload.ts`) מרכיב מעל
      `createSecretRegistry`/`REDACTED_FIELD_PATHS` הקיימים ב-`packages/platform` (לא ממציא אותם מחדש) —
      שכבת תבניות לפי צורה (AWS/GCP-PEM/OpenAI/Slack/GitHub/JWT/`.env`), שכבת שם-שדה, ושכבת אנטרופיה.
      `GeminiProvider` מפעיל זאת בפועל על כל payload יוצא **לפני** הקריאה ל-SDK (לא רק ללוגים) ורושם כל
      רדקציה שקרתה.

> **הגדרת גמור לשלב:** סקריפט הדגמה שולח פרומפט, מקבל סטרימינג, ומדפיס `usage` מדויק. מפתח מאוחסן בבטחה. 429 מדומה מתאושש.

---

<a name="p2"></a>
## P2 · 🏁 שלד הליכה — צ'אט E2E `M`

**מטרה:** המסלול המלא UI → runtime → Gemini → UI חי. **בלי תזמור** — רק להוכיח שהצינור עובד.

- [x] **P2-T1 · שרת** — Fastify + WebSocket + כיבוי מסודר.
      *גמור:* `pnpm dev` מרים שרת + UI בפקודה אחת.
- [x] **P2-T2 · התמדה** 🪟 — **`node:sqlite` המובנה ב-Node 22** (לא `better-sqlite3`): אפס תלויות
      נייטיב, אפס קומפילציה ב-Windows. טבלאות: `threads`, `messages`, `runs`, `events` + מיגרציות.
      ⚠️ **המודול מסומן experimental** ומדפיס `ExperimentalWarning` (אומת ב-Node 22.22 — עובד ללא דגל).
      לכן: **עוטפים אותו ב-`apps/runtime/src/db/driver.ts` מאחורי ממשק צר**, כדי שהחלפה תיגע בקובץ אחד
      אם ה-API ישתנה. האזהרה מושתקת בעלייה. הנימוק והחלופות: [ADR-012](DECISIONS.md#adr-012).
      *גמור:* הודעות שורדות הפעלה מחדש · מיגרציה רצה אוטומטית · **עובר ב-CI בשלוש הפלטפורמות** ·
      אף מודול חוץ מ-`driver.ts` לא מייבא `node:sqlite` ישירות (נאכף ב-lint).
- [x] **P2-T3 · שלד UI** — React + Vite + Tailwind + shadcn/ui · **`dir="rtl"` + i18n מהיום הראשון**
      ([ADR-010](DECISIONS.md#adr-010)) · בהיר/כהה.
      *גמור:* אין מחרוזת קשיחה ב-JSX · המעבר לאנגלית עובד · המסך תקין בשתי הערכות.
- [x] **P2-T4 · צ'אט** — רשימת הודעות, תיבת כתיבה, סטרימינג של תשובה.
      *גמור:* הודעה נשלחת והתשובה זורמת תו-אחר-תו.
- [x] **P2-T5 · רינדור Markdown** — GFM + Shiki + Mermaid + KaTeX + כפתורי העתקה.
      *גמור:* **מקרה בדיקה: פסקה עברית עם מונח אנגלי ובלוק קוד — הכיווניות תקינה** ([`UX.md` §9](UX.md#9-עברית-rtl-ונגישות)).
- [x] **P2-T6 · אירועים** — אפיק ה-WebSocket מ-[`PROTOCOLS.md` §9](PROTOCOLS.md#9-אירועי-runtime--ui), עם `seq`
      וחיבור מחדש שמשלים פערים.
      *גמור:* ניתוק ל-30 שניות באמצע ריצה — ה-UI משלים ולא מפספס אירוע.
- [x] **P2-T7 · הגדרות** — מסך מפתח API עם אימות חי ואינדיקציה **היכן נשמר**.
      *גמור:* משתמש חדש מגיע למסך הזה · המפתח ממוסך · החלפה עובדת.
- [x] **P2-T8 · מד תקציב (תצוגה)** — מונה טוקנים אמיתי בכותרת. עדיין בלי אכיפה.
      *גמור:* המונה תואם ל-`usageMetadata` המצטבר.

> **🏁 הדגמת M1:** משתמש חדש מכניס מפתח, שואל שאלה, מקבל תשובת Markdown זורמת, ורואה כמה טוקנים זה עלה.

---

<a name="p3"></a>
## P3 · קליטה ו-ArtifactStore `L`

**מטרה:** להפוך קלט גולמי למידע זול. **כאן נקבע אם 100MB אפשריים.** ניתן לפיתוח במקביל ל-P1/P2.

- [x] **P3-T1 · העלאת קבצים** — ריבוי, גרירה, הדבקה, התקדמות, ביטול.
      *גמור:* 50 קבצים מעורבים נקלטים · קובץ פגום לא מפיל את הקבוצה.
      *כפי שמומש:* `ingestFiles` (`packages/ingest/src/connect/ingest-files.ts`) הוא צד-הספרייה של "ריבוי,
      גרירה, הדבקה" — התקדמות דרך `onProgress` (נקרא אחרי כל קובץ, לא רק בסוף) וביטול דרך `AbortSignal`.
      חיבור הרכיבים המצומדים בפועל (drag/drop/paste ל-DOM) הוא עבודת UI ל-P5+/P9, לא לשלב הזה — ראה הגדרת
      גמור לשלב. נבדק על 50 קבצים מעורבים (קוד/PDF/DOCX/PPTX/תמונות) עם 4 קבצים פגומים בכוונה.
- [x] **P3-T2 · חיבור תיקייה** — בחירת שורש, כיבוד `.gitignore` + `.aoignore`, עץ עם גדלים, כלול/החרג.
      *גמור:* תיקייה של 10K קבצים נסרקת ללא הקפאת UI · `node_modules` מוחרג כברירת מחדל.
      *כפי שמומש:* `connectFolder` (`packages/ingest/src/connect/connect-folder.ts`) — DFS א-סינכרוני מעל
      `fs.promises`, `.gitignore`/`.aoignore` מקוננים מטופלים נכון (קובץ ב-`packages/a/.gitignore` מוגבל
      ל-subtree שלו, לא משפיע על `packages/b`), באמצעות חבילת `ignore` (אפס תלויות, אותה חבילה ש-ESLint
      עצמו משתמש בה). נבדק על 10,000 קבצים.
- [x] **P3-T3 · מחלצים** — קוד · PDF · DOCX · PPTX · XLSX/CSV · תמונות · ארכיונים · בינארי
      (לפי [`ARCHITECTURE.md` §5.1](ARCHITECTURE.md#51-קליטה-מקומית-ללא-טוקנים)).
      *גמור:* קורפוס בדיקה עם כל סוג · **מחלץ שנכשל לא מפיל קליטה — הקובץ מסומן ונרשם כפער**.
      *כפי שמומש:* `packages/ingest/src/extract/` — `pdfjs-dist` (build `legacy`, בלי `canvas`), `mammoth`
      ל-DOCX, `xlsx` (SheetJS) ל-XLSX/CSV, `image-size` למטא-דאטה בלבד, `fflate`+`fast-xml-parser` ל-PPTX
      (אין ספרייה בוגרת ברמת `mammoth` ל-PPTX — נכתב מחלץ קטן שמפרק את ה-zip וקורא `<a:t>`), `fflate`
      לארכיוני zip. כולן אומתו כאפס-תלויות-נייטיב בפועל (התקנה נקייה, בלי `node-gyp`). `extractArtifact`
      לעולם לא זורק — כשל מוחזר כ-`{failed:true, warnings}`.
- [x] **P3-T4 · Chunking** — מודע-מבנה (גבולות פונקציה/כותרת), עם חפיפה, שומר מיקומים.
      *גמור:* לכל chunk יש `artifactId` + `loc` מדויק · בדיקות round-trip.
      *כפי שמומש:* `chunkText` (`packages/ingest/src/chunk/chunk.ts`) — נקודות חיתוך מועדפות בשורות ריקות/
      כותרות Markdown/הכרזות top-level, עם חפיפה בין chunks סמוכים. `loc` הוא הטווח הבלעדי-לא-חופף
      (לא כולל את החפיפה) — בדיקות round-trip מוודאות שהטווחים הבלעדיים משחזרים את הטקסט המקורי בדיוק.
- [x] **P3-T5 · `RepoMap`** — tree-sitter: סמלים, ייצוא/ייבוא, נקודות כניסה, גרף תלויות, מפת בדיקות.
      *גמור:* מאגר TS בינוני ממופה תחת 10 שניות · הפלט מתחת ל-40K טוקנים למאגר של 1,000 קבצים.
      *כפי שמומש:* `web-tree-sitter` — **מוצמד ל-`0.20.8`, לא לגרסה העדכנית**: אומת ישירות שהגרסה
      העדכנית (`0.27.0`) נכשלת בטעינת קבצי ה-`.wasm` המוכנים של `tree-sitter-wasms@0.1.13` (אי-התאמת
      ABI) — ראה [ADR-016](DECISIONS.md#adr-016). אפס קומפילציה נייטיב בשתי הגרסאות. `serializeRepoMap`
      מקודד JSON קומפקטי עם **מילון נתיבים/specifiers** (הפניה באינדקס ולא חזרה על המחרוזת המלאה בכל
      קשת בגרף התלויות) ומדרגת בהדרגה (גרף תלויות → מפת בדיקות → תקרת סמלים לקובץ → קבצים שלמים) אם
      התוכן לא נכנס בתקציב — לעולם לא חורג, ומדווח מה נחתך. נבדק על מאגר סינתטי של 1,000 קבצים.
- [x] **P3-T6 · אינדקס BM25** — מקומי, אינקרמנטלי, נשמר לדיסק.
      *גמור:* שאילתה על 100K chunks תחת 200ms · אינדוקס חוזר רק על מה שהשתנה.
      *כפי שמומש:* `Bm25Index` (`packages/ingest/src/index/bm25.ts`) — אינדקס הפוך טהור (ADR-007: לקסיקלי
      לפני embeddings), טוקניזציה תומכת עברית+אנגלית (`\p{L}\p{N}`). `addOrUpdate` מדלג על מסמך שה-hash
      שלו לא השתנה — זה מה שהופך אינדוקס חוזר לזול. `saveToFile`/`loadFromFile` לדיסק.
- [x] **P3-T7 · מטמון לפי hash** — `sha256` לכל artifact; **כל** נגזרת ממוטמנת תחתיו.
      *גמור:* קליטה שנייה של אותה תיקייה כמעט מיידית · תקצירי R4 לא מחושבים פעמיים לעולם.
      *כפי שמומש:* `DerivativeCache` (`packages/ingest/src/cache/derivative-cache.ts`) — מטמון כללי על
      דיסק, ממוען לפי `(namespace, sha256)`, `getOrCompute` גנרי לכל נגזרת עתידית (chunks, RepoMap,
      תקצירים). R4 עצמו (תקצור ע"י מודל זול) הוא P6+ — לא רלוונטי ל-P3 (אפס קריאות LLM), אבל המטמון
      עצמו כללי מספיק לשמש אותו ללא שינוי.
- [x] **P3-T8 · `ContextBroker`** — בחירת הקשר בסדר העדיפויות של
      [`ARCHITECTURE.md` §5.3](ARCHITECTURE.md#53-תקציב-הקשר-לכל-task), מתחת לתקרה קשיחה.
      *גמור:* **לעולם לא חורג מ-`contextBudget`** (בדיקת property) · מדווח מה נכלל ומה נחתך.
      *כפי שמומש:* `selectContext` (`packages/ingest/src/broker/context-broker.ts`) — ממלא בסדר העדיפויות
      מ-§5.3 בדיוק, מדלג (לא עוצר) על פריט בודד שלא נכנס כדי לא לחסום פריטים קטנים יותר בעדיפות נמוכה
      יותר. בדיקת property: 2,000 קלטים אקראיים (כולל תקציב שלילי) — `totalTokens` אף פעם לא חורג.
- [x] **P3-T9 · הערכת טוקנים** — `estimateTokens(text, kind)` לפי סוג תוכן
      ([`BUDGET.md` §4.4](BUDGET.md#44-הערכה-בלי-קריאת-רשת)).
      *גמור:* סטייה מתחת ל-15% מול `countTokens` על קורפוס מעורב עברית/אנגלית/קוד.
      *כפי שמומש:* יחסי chars/token נמדדו אמפירית (לא ניחוש) מול `LocalTokenizer` — הטוקנייזר האופליין
      שמגיע מובנה עם `@google/genai/tokenizer`, רץ מקומית לגמרי (אין רשת, אין מפתח API, אין קריאת LLM
      אמיתית — זו חישוב טוקניזציה טהור). עברית נמדדה **צפופה משמעותית** מאנגלית (‎~2.1‎ מול ‎~5.0‎
      תווים/טוקן) — לא ברירת המחדל המקובלת של "4 תווים לטוקן". נבדק מול קורפוס נבדל מזה שבו כויל.
- [x] **P3-T10 · `EgressLedger`** — רישום כל בייט יוצא, מקושר ל-artifact ולקריאה.
      *גמור:* מזין את פאנל "מה יצא מהמחשב" ([`UX.md` §7](UX.md#7-פאנל-מה-יצא-מהמחשב)).
      *כפי שמומש:* `EgressLedger` (`packages/ingest/src/egress/egress-ledger.ts`) — תואם בדיוק את מטען
      אירוע `egress.recorded` מ-[`PROTOCOLS.md` §9](PROTOCOLS.md#9-אירועי-runtime--ui). `summary()` מפרק
      לפי artifact (מחלק בייטים שווה בשווה בין ה-artifacts שקריאה מסוימת ציטטה). הרדקציה עצמה נשארת
      תפקיד `@ao/providers` — כאן רק נרשם מה שכבר נשלח.

> **הגדרת גמור לשלב:** תיקייה של 100MB נקלטת, ממופה ומאונדקסת **בלי אף קריאת LLM**. `RepoMap` + אחזור עונים "איפה מטופל אימות?" בחינם.

---

<a name="p4"></a>
## P4 · Ledger ומנוע התקציב `M`

**מטרה:** להפוך את התקציב מדוח בדיעבד לבקרת כניסה.

- [x] **P4-T1 · `Ledger`** — `total/spent/committed/available/reserve`, לפי שלב ולפי ריצה.
      *גמור:* מחלקה טהורה, ללא I/O · בדיקות יחידה מלאות · הפרדת מדד טוקנים ממדד עלות ([ADR-004](DECISIONS.md#adr-004)).
      *כפי שמומש:* `Ledger` (`packages/core/src/ledger/ledger.ts`) — מחלקה סינכרונית טהורה לגמרי, אפס
      I/O. מחזיקה `total/spent/committed/available/reserve` ברמת הריצה, ופירוט נפרד לפי `stageId` ולפי
      `agentType` (`byStage`/`byAgentType`). ADR-004 ממומש כשני חישובים בלתי-תלויים לגמרי: משקל
      `cachedTokens` **בטוקנים** נשלט ע"י `cachedTokensWeight` (ברירת מחדל 1 = משקל מלא), וההנחה
      **בעלות** ($) מגיעה מ-`ModelPricingLike.cachedInputPerMillionUsd` בנפרד — שינוי באחד אף פעם לא
      זולג לשני. `packages/core` תלוי רק ב-`@ao/shared` (הטיפוסים והשגיאות), לא ב-`@ao/providers`,
      לפי הכלל שנקבע כבר ב-[P1-T1](#p1).
- [x] **P4-T2 · הקצאה** — חלוקה לדליים לפי [`BUDGET.md` §3](BUDGET.md#3-הקצאה), עם `reserve` נעול.
      *גמור:* `reserve` לא ניתן להקצאה בשום מסלול · יש בדיקה שמנסה ונכשלת.
      *כפי שמומש:* `allocateBudget` (`buckets.ts`) מחלקת את `budget.total` ל-6 הדליים הרגילים לפי
      האחוזים המדויקים מ-BUDGET.md §3, ואת ה-`reserve` (12%) בנפרד — **אין בחתימת הפונקציה שום פרמטר
      שיכול לדרוס אותו**, זו לא רק בדיקת ריצה. `assertSpendableBucket` הוא השער היחיד שדרכו כל
      `Ledger.commit` עובר; `bucket: "reserve"` זורק `BudgetReserveLockedError` (שכבר קיימת מ-P0
      ב-`@ao/shared`). המסלול היחיד שכן מגיע לרזרבה הוא `Ledger.drawFromReserve`, נפרד לגמרי מ-`commit`.
- [x] **P4-T3 · בקרת כניסה** — `admit()` לפי [`BUDGET.md` §4.1](BUDGET.md#41-לפני-קריאה).
      *גמור:* **אין מסלול קוד שמגיע לספק בלי `admit()`** — נאכף בטיפוסים או בעטיפה יחידה · בדיקה מוכיחה.
      *כפי שמומש:* `admit()` (`admission.ts`) ממש את הלוגיקה מ-§4.1 (`available ≥ worstCase` → אישור +
      `commit`). העטיפה היחידה הנדרשת היא `runAdmitted()` — הפונקציה היחידה בחבילה שקוראת בפועל
      ל-callback שמייצג "הגעה לספק"; `admit()` תמיד רץ **לפניו**, ו-`settle`/`release` תמיד רצים
      **אחריו** (הצלחה/כישלון). `admission.test.ts` מוכיחה עם `vi.fn()` שה-callback אף פעם לא נקרא
      כשהבקשה נדחתה — `packages/core` עצמו לא קורא לאף ספק אמיתי (זה תפקיד P5), אז זו רמת האכיפה
      שהחבילה הזו יכולה לספק; P5 חייב לנתב כל קריאה דרך `runAdmitted`.
- [x] **P4-T4 · יישוב** — `committed` משוחרר ו-`spent` מעודכן מ-`usageMetadata`.
      *גמור:* קריאה שנכשלה משחררת `committed` · אין דליפה גם בשגיאה או בביטול.
      *כפי שמומש:* `Ledger.settle()`/`Ledger.release()` — שניהם מוחקים את ה-`Reservation` ממפת
      ה-reservations הפתוחות (`openReservationCount`), כך שקריאה כפולה על אותו handle זורקת שגיאה
      במקום לדלוף בשקט. `release()` אף פעם לא מוסיף ל-`spent`. נבדק גם ל-failure/cancel וגם
      ל-double-resolve (settle פעמיים, release פעמיים).
- [x] **P4-T5 · סולם הידרדרות** — 8 הדרגות של [`BUDGET.md` §5](BUDGET.md#5-סולם-ההידרדרות).
      *גמור:* כל דרגה נבדקת · כל הידרדרות נרשמת עם סיבה · **דרגה 8 תמיד מצליחה**.
      *כפי שמומש:* `runDegradationLadder` + `applyDegradationStep` (`degradation.ts`) — דרגה נפרדת
      ובדוקה בנפרד לכל אחת מ-8 הדרגות (K→thinkingLevel→fanout→ensemble→tier→readRung→optional→reserve).
      כל דרגה שהופעלה בפועל נרשמת ל-`DegradationEvent` עם סיבה. דרגה 8 (`Ledger.drawFromReserve`)
      **לעולם לא זורקת** — קוצצת (`clamped`) עד מה שנשאר ברזרבה, גם אם זה 0. שלוש המדיניות מ-§5
      (`degrade`/`ask`/`hard-stop`) ממומשות כפרמטר `policy`: `ask` אף פעם לא מדרדרת לבד ומחזירה
      `needs-user-decision`, `hard-stop` קופצת ישר לדרגה 8.
- [x] **P4-T6 · כיול** — שמירת `actual/worstCase` לפי `(agentType, thinkingLevel)`, אחוזון 90.
      *גמור:* מהריצה השנייה ההזמנה מתהדקת · התקרה נשארת רשת ביטחון.
      *כפי שמומש:* `CalibrationStore` (`calibration.ts`) שומרת יחס `actual/worstCase` לפי
      `(agentType, thinkingLevel)`, עד 200 דגימות אחרונות למפתח (nearest-rank p90, ללא אינטרפולציה).
      `estimate()` תמיד `Math.min(worstCaseHint, ...)` — התקרה התיאורטית נשארת רשת ביטחון גם אם
      ריצה בפועל חרגה ממנה. עם 0 דגימות מוחזרת ההערכה המקורית ללא שינוי; מהדגימה הראשונה ואילך
      ההזמנה מתהדקת.
- [x] **P4-T7 · סימולטור** — תמחור תוכנית לפני ביצוע ([`BUDGET.md` §6](BUDGET.md#6-סימולטור-עלות-dry-run)).
      *גמור:* פלט תואם לדוגמה במסמך · סטייה מתחת ל-25% אחרי כיול.
      *כפי שמומש:* `simulatePlan` (`simulator.ts`) משחזר את דוגמת §6 **בדיוק** (4 שלבים, תקציב 2.5M) —
      נבדק שהטוטלים לפי שלב, ה-`executionTotal`, ה-`overheadTotal` והרזרבה תואמים למספרי הדוגמה.
      ⚠️ **הערה לגבי `overheadTotal`:** נבנה מ-checkpoints+planning בלבד (7% = 175K/180K בדוגמה) —
      **תיקונים (`repair`, 9%) לא נכללים בהערכה מראש**, כי זו הוצאת contingency לכשלים שעוד לא קרו;
      זה מסביר את הפער בין תווית השורה במסמך ("צ'קפוינטים + תכנון + תיקונים") לחישוב שלה, שמשתמש
      רק בשני האחוזים הראשונים — ראה הערת קוד ב-`simulator.ts`. תומך בכיול (`CalibrationStore`)
      להצרת ההערכה לפי שלב ובחישוב $ כשמסופקת טבלת מחירים (`PricingLookup`).
- [x] **P4-T8 · דוח "לאן הלכו הטוקנים"** — פירוט לפי שלב/סוכן, **כולל כמה נחסך בכל מנוף**.
      *גמור:* חיסכון מעיבוד מקומי, מטמון ומטמון-הקשר מוצג במספרים.
      *כפי שמומש:* `buildTokenReport` (`report.ts`) מרכיב פירוט לפי `stage`/`agentType` (כבר נשמר
      ב-`Ledger` עצמו), פירוט נפרד ל-`reserveSpent`/`reserveCommitted` (עם `grandTotalSpent` — הרבה
      פעמים תוצר סופי הופק **דווקא** מהרזרבה, ראה `phase-done.test.ts`), וסכימה לפי כל אחד מ-8 מנופי
      החיסכון מ-§7 (`SavingsRecord`). `packages/core` עצמו לא מכיל מטמון/ArtifactStore/Scheduler —
      כל מנוף (hash-cache, context-cache, response-cache, dedup וכו') **מדווח את החיסכון שלו פנימה**
      מבחוץ; הדוח רק מרכיב ומציג. כולל גם ספירת הידרדרויות לפי דרגה.

> **הגדרת גמור לשלב:** ריצה עם תקציב מלאכותי נמוך **מורידה דרגה בהצלחה ומחזירה תוצר**, במקום לחרוג או להיתקע.
> *כפי שמומש:* `phase-done.test.ts` מדגים את זה קצה-לקצה בתוך היקף P4 (אין עדיין Scheduler — זה P5):
> תקציב של 20K טוקנים מול בקשה תיאורטית של 5M מסיים בדרגה 8 (סינתזה מהרזרבה), הפנקס אף פעם לא יורד
> מתחת לאפס, ואין reservation שדולפת (`openReservationCount === 0`) — והדוח שמופק בסוף עקבי ומראה
> בדיוק מאיפה הגיע התוצר.

---

<a name="p5"></a>
## P5 · 🏁 ליבת התזמור `L`

**מטרה:** לב המערכת. **השלב הכי חשוב בפרויקט.**

- [x] **P5-T1 · סכמת `Plan` + ולידציה** — כל 8 הוולידציות V1–V8 מ-[`PROTOCOLS.md` §1](PROTOCOLS.md#1-plan--סכמת-התוכנית).
      *גמור:* בדיקה לכל ולידציה בנפרד · תוכנית לא תקינה **לעולם** לא מתחילה לרוץ.
      *כפי שמומש:* `packages/core/src/plan/validate.ts` — כל V-check הוא פונקציה מיוצאת עצמאית
      (`validateV1`...`validateV8`, ניתנות לבדיקה ישירה), ו-`validatePlan(input, context)` הוא המצרף:
      `PlanSchema.safeParse` קודם (קצר-מעגל בכשל, לעולם לא זורק), ואז כל שאר הבדיקות רצות במלואן ומצטברות
      יחד — כדי שתוכנית פסולה תחזיר את **כל** הבעיות בבת אחת ולא לולאת "תקן-אחת-הרץ-שוב". נקודות פרשנות
      שהמסמכים לא קבעו במפורש, כל אחת מתועדת בקוד: V4's "מרווח ביטחון 10%" מיושם כ-
      `maxOutputTokens ≤ floor(modelMaxOutputTokens × 0.9)`; V5's "מוקדם יותר ב-DAG" נבדק כהשתייכות ל-סגור
      ה-`dependsOn` הטרנזיטיבי של השלב הצורך (לא רק מיקום מוקדם יותר במערך); V6 גם אוכף את חסימת
      `ensemble`/`debate` ב-`draft` מ-[BUDGET.md §1](BUDGET.md#1-כפתור-מטרה) (המסמך מייחס את זה ל-`Ledger`,
      אך זו בדיקת "תקרה גלובלית" מובהקת ששייכת לוולידציית התוכנית); ו-V7, ש-`Stage` לא נושא שדה מפורש
      שמקשר אותו ל-`Deliverable`, ממומש כמיפוי מתועד (`DELIVERABLE_KIND_AGENT_TYPES` ב-`plan/types.ts`) בין
      `Deliverable.kind` לתפקידי הסוכנים מ-[`ARCHITECTURE.md` §4](ARCHITECTURE.md#4-סוגי-סוכנים)
      (`writer`/`synthesizer`→`markdown`, `coder`→`files`, קבוצה רחבה יותר→`data`) — אותה מוסכמה ישמש גם
      ה-`planner` (P5-T3) שנבנה באותו שלב, כך שהצדדים לא יכולים לסטות זה מזה. תקרות `maxParallel`/`maxRung`
      לפי רמת תקציב (`draft`/`standard`/`deep`/`custom`) מגיעות ישירות מ-[BUDGET.md §1](BUDGET.md#1-כפתור-מטרה).
      27 בדיקות, כולל בדיקת "אף פעם לא זורק" על קלט `null`/`undefined`/פרימיטיבי.
- [x] **P5-T2 · `recon`** — סוכן + סכמת `TaskUnderstanding`.
      *גמור:* מקבל אינוונטר בלבד, **לא תוכן** · עולה פחות מ-2% מהתקציב.
      *כפי שמומש:* `packages/core/src/recon/recon.ts` — `ReconRequest` נושא רק `userRequest`+`inventory`;
      **אין שדה** לתוכן קבצים גולמי בחתימת הפונקציה כלל, כך ש"מקבל אינוונטר בלבד" נאכף מבנית (כמו הגישה
      שכבר ננקטה ב-Blackboard, P5-T9). קריאת recon בונה `GenerateRequest` יחיד עם `responseSchema:
      TaskUnderstandingSchema` (אובייקט JSON יחיד, לא NDJSON — recon לא עובר דרך מריץ הסוכן הגנרי של
      P5-T6). ⚠️ **תיקון בזמן פיתוח:** ההנחה הראשונית הייתה ש-ניתוב הקריאה דרך דלי `"recon"` ב-Ledger
      **אוכף מבנית** את תקרת 2% (כי `buckets.recon = 2%·total`) — **זו טעות שנתפסה ע"י בדיקה שנכשלה**:
      `Ledger.commit` (P4-T1, `ledger.ts`) בודק רק את `available` **ברמת הריצה כולה**, לא קיבולת דלי
      ספציפי — שיוך לדלי הוא רישום/דיווח בלבד, לא תקרה. `runRecon` לכן בודק **במפורש** `worstCase` מול
      `ledger.bucketSnapshot("recon").available` **לפני** `runAdmitted`, וזורק `BudgetExceededError` בלי
      להגיע לספק בכלל אם חורג — זו האכיפה האמיתית של "פחות מ-2%", לא הנחה שגויה על ניתוב-דלי. 6 בדיקות,
      כולל הבדיקה שתפסה את הבאג (worstCase שחורג מקיבולת הדלי נדחה **בלי אף קריאה לספק**) ובדיקות JSON
      לא-תקין/לא-תואם-סכמה שלא משאירות reservation דולף.
- [x] **P5-T3 · `planner`** — מייצר DAG תקף בתוך התקציב, עם הערכות לכל שלב.
      *גמור:* 10 משימות לדוגמה מייצרות תוכניות תקפות · חריגת תקציב נדחית ונשלחת לתיקון.
      *כפי שמומש:* `packages/core/src/planner/planner.ts` — `runPlanner` מריץ את כל 8 הוולידציות V1-V8
      (`validatePlan` מ-P5-T1, לא כפילות לוגיקה) על **כל** תגובת מודל לפני קבלתה; תוכנית לא תקינה — כולל
      חריגת תקציב (V2) — לעולם לא מוחזרת, אלא נדחית ומוזנת חזרה למודל כפרומפט תיקון (`buildRepairPrompt`,
      עם רשימת הבעיות המדויקות מ-`validatePlan`) עד `maxRepairAttempts` (ברירת מחדל 2, כלומר 3 ניסיונות
      סה"כ); מיצוי כל הניסיונות זורק `PlanInvalidError` עם תקציר הבעיות האחרונות. JSON לא-תקין מטופל
      **באותה לולאת תיקון** בדיוק כמו תוכנית לא-תקינה סכמטית (לא נכשל מיידית) — קוד V1 סינתטי. שימוש בדלי
      `planning` (3%, לפי BUDGET.md §3 שכולל "בניית התוכנית **+ תיקונים**" באותו דלי במפורש — לא כמו
      דלי `repair` הנפרד של P5-T8's continuations) עם אותה בדיקת קיבולת-דלי מפורשת שנלמדה ב-P5-T2 (לא
      הנחה שגויה על ניתוב-דלי). 5 בדיקות: הצלחה בניסיון ראשון · חריגת תקציב → תיקון → הצלחה (כולל בדיקה
      שהפרומפט השני אכן מזכיר את קוד V2) · מיצוי כל הניסיונות → `PlanInvalidError` · JSON פגום מתאושש
      בניסיון הבא · חריגה מקיבולת דלי ה-planning נדחית לפני קריאה לספק.
- [x] **P5-T4 · Scheduler** — ביצוע DAG, מקביליות חסומה, ריצה טופולוגית, ביטול.
      *גמור:* **בדיקת property: אף פעם לא מעבר ל-`maxParallel`** · ביטול עוצר נקי בלי לדלוף `committed`.
      *כפי שמומש:* `packages/core/src/scheduler/` — `pool.ts`'s `runPool` הוא worker-pool מקומי (לא
      `ConcurrencyLimiter` של `@ao/providers` — `core` לא יכול לתלות בו בקוד ייצור, רק כ-devDependency
      לבדיקות כפי שנקבע ב-P5-T8); התקרה נכונה כי `nextIndex += 1` תמיד קורה סינכרונית לפני ה-`await` הבא,
      אין תזמון מקדים ב-JS. `topo.ts`'s `topologicalStageOrder` (Kahn's algorithm) מניח DAG א-מעגלי —
      P5-T1's V1 כבר הוכיח את זה לפני שהתוכנית מגיעה ל-Scheduler בכלל — עם שבירת תיקו דטרמיניסטית
      לפי מזהה שלב. `scheduler.ts`'s `runScheduler` מריץ שלבים אחד־אחרי-השני בסדר טופולוגי (לא מקביליות
      חוצת-שלבים — הפרשנות הפשוטה והמוצדקת יותר, תואמת את דיאגרמת מחזור החיים ב-ARCHITECTURE.md §3 שמתארת
      כל שלב כרצף a-f); בתוך שלב, Tasks (מ-`planFanout`, P5-T5) רצים עם `runPool` בתקרת
      `min(stage.fanout.maxParallel, globalMaxParallel)` — **חוץ** ממצב `pipeline`, שנאכף לרוץ בתקרה 1
      תמיד (שרשרת תלות אמיתית לא יכולה לרוץ במקביל, לא משנה מה `maxParallel` מצהיר). כניסה לכל Task
      משתמשת ב-`admit()` (לא `runAdmitted`) בכוונה: דחיית תקציב ברמת Task היא מדיניות כשל של
      [`ARCHITECTURE.md` §10](ARCHITECTURE.md#10-מדיניות-כשל) ("דילוג עם רישום פער"), לא חריגה שמפילה את
      כל הריצה — עדיין אותם primitives בדיוק (`admit`/`settle`/`release` מ-P4-T3/T4), רק דיווח כתוצאה רכה
      במקום זריקה. ביטול (`AbortSignal`) נבדק לפני כל שלב חדש ולפני כל Task חדש בתוך pool; Task שכבר
      בטיסה כשה-signal יורה מטופל ע"י `runTask` שלו (מיושם ע"י הקורא) שדוחה, ואז `ledger.release()` רץ
      באותו נתיב catch בדיוק כמו כשל רגיל — "לא דולף" הוא לא מנגנון מיוחד, הוא תוצאה ישירה משימוש עקבי
      ב-admit/settle/release. 17 בדיקות: סדר טופולוגי (שרשרת + יהלום + שבירת-תיקו) · property test של
      25 טריאלים אקראיים על maxParallel/count · pipeline נאכף לתקרה 1 · ביטול תוך-כדי-טיסה בלי דליפת
      reservation · ביטול-לפני-התחלה · דחיית תקציב בלי קריאה ל-runTask · כשל Task לא עוצר את הריצה ·
      חיווט sharding נכון.
- [x] **P5-T5 · פילוח (sharding)** — כל 5 המצבים מ-[`ARCHITECTURE.md` §4](ARCHITECTURE.md#מצבי-fan-out).
      *גמור:* `shard` מייצר פלחים **זרים ומכסים** · אין שני Tasks עם אותו קובץ באותו שלב.
      *כפי שמומש:* `packages/core/src/sharding/` — `shard.ts`'s `buildShards` היא bin-packing חמדני
      (longest-processing-time-first: קבוצות ממוינות לפי משקל יורד, כל קבוצה הולכת ל-shard הכי קל כרגע),
      תוך שמירת לכידות `groupKey` — כל הפריטים עם אותו `groupKey` (למשל קבצי אותו מודול) נשארים תמיד באותו
      shard, וזה בדיוק מה שמבטיח מבנית ש"אין שני Tasks עם אותו קובץ": כל עוד `shardKey` נפתר ל-`groupKey`ים
      שלא חופפים בקבצים (אחריות הקורא — המתכנן/agent runner, ש-`shard.ts` לא יודע איך "module" מתפרש
      בפועל). `verifyShards` הוא בודק-הגנה-כפולה עצמאי (לא רק "אמון" באלגוריתם) שנבדק ב-property test של
      200 טריאלים אקראיים (item/group/shard counts משתנים) — אף פעם לא מוצא הפרת disjoint/covering/shared-file.
      `fanout.ts`'s `planFanout` ממפה את כל 5 המצבים ל-`TaskSpec[]`: `shard` דרך `buildShards`;
      `ensemble`/`debate` **זהים** ברמת התזמון (N Tasks עצמאיים עם הקלט המלא — ההבדל ביניהם הוא רק ב-reducer
      שממזג בהמשך, לא כאן); `pipeline` בונה שרשרת לינארית (`pipelineDependsOn` מצביע ל-Task הקודם);
      `single` תמיד Task יחיד בלי תלות ב-`fanout.count`. 12 בדיקות.
- [x] **P5-T6 · מריץ סוכן** — טעינת `agent.md`, מילוי משתנים, `{{outputSpec}}` **נגזר מהסכמה**.
      *גמור:* פרומפט וּוַלידטור לא יכולים להיות לא-מסונכרנים ([ADR-006](DECISIONS.md#adr-006)).
      *כפי שמומש:* `packages/core/src/agent-runner/` — "טעינת `agent.md`/`agent.json`" מפוצלת בכוונה: קריאת
      הקבצים בפועל מהדיסק (`agents/<type>/`) היא I/O ונשארת אחריות ה-composition root (`apps/runtime`, טרם
      נבנה P5) — `parseAgentDefinition` (`request.ts`) מקבל את תוכן ה-JSON **שכבר נקרא**ומאמת אותו מול
      `AgentDefinitionSchema` הקיים; `buildAgentPrompt`/`fillTemplate` (`prompt.ts`) מקבלים את תוכן `agent.md`
      כטקסט מוכן. `{{outputSpec}}` נגזר תמיד מ-`z.toJSONSchema()` (`toJsonSchema` הקיים ב-`@ao/shared`) על
      אותה סכמת Zod חיה שהפרסר יאמת נגדה בפועל — **אין דרך** לכתוב תיאור פלט ידני שיכול לסטות מהוולידטור,
      כי `{{outputSpec}}` אף פעם לא מוקלד ביד. `fillTemplate` נכשל בקול (זורק) על placeholder לא-מוכר
      במקום להשאיר `{{x}}` גולמי בפרומפט — זו אכיפת ADR-006 השנייה: תבנית שמתייחסת למשתנה לא קיים נתפסת
      בזמן בניית הפרומפט, לא כתשובת מודל מבולבלת. `buildAgentRequest` (`request.ts`) **אף פעם לא** מגדיר
      `responseSchema`: `outputContract.format` של כל סוכן-עבודה קבוע ל-`"ndjson"` (טקסט חופשי מרובה-שורות,
      לא אובייקט מובנה יחיד) — מנגנון `responseSchema` של Gemini שייך ל-`recon`/`planner` (P5-T2/P5-T3),
      שבונים `GenerateRequest` משלהם ישירות מול `TaskUnderstandingSchema`/`PlanSchema`, לא דרך מריץ הסוכן
      הגנרי הזה. 13 בדיקות, כולל בדיקה מפורשת ששתי סכמות שונות מייצרות `{{outputSpec}}` שונה (מוכיחה
      שהתלות היא בסכמה בפועל, לא בהעתק ישן).
- [x] **P5-T7 · פרסר NDJSON** — כל 6 הכללים מ-[`PROTOCOLS.md` §3](PROTOCOLS.md#3-חוזה-פלט-סוכן--ndjson).
      *גמור:* **fuzz על פלט קטוע בכל מיקום אפשרי — הפרסר לא קורס לעולם** · שורה חלקית נזרקת בשקט.
      *כפי שמומש:* `packages/core/src/parse/ndjson.ts` — `parseNdjson(text)` טהורה וסינכרונית, אף פעם לא
      זורקת. שורה אחרונה שהטקסט לא מסתיים ב-`\n` מטופלת בנפרד (כלל 2): מנסים לפרסר אותה, ובכשל היא נזרקת
      בלי להיספר לא ב-`totalLines` ולא ב-`schemaViolations`. `schemaViolations` (כלל 1) נספר רק על שורות
      שנכשלות ב-JSON.parse **או** לא תואמות אף וריאנט ב-`NdjsonEnvelopeSchema` — לעומת זאת `file_chunk` יתום
      (כלל 4) נספר בנפרד (`orphanedChunkCount`), כי השורה עצמה תקינה סכמטית; רק סדר הפרוטוקול שגוי. הרכבת
      קבצים (כללים 4–5) ממיינת chunks לפי `seq` לפני שרשור, מחשבת `sha256` עם `node:crypto` (חישוב טהור,
      לא I/O — לא סותר את "`core` בלי I/O" של README), ודוחה קובץ עם `sha256-mismatch` בלי לכתוב אותו.
      כלל 3 (השלמה) מדווח `done`/`doneEnvelope` בלבד — ההחלטה על פרוטוקול המשכיות היא באחריות P5-T8, לא
      הפרסר. כלל 6 מחושב כ-`violationRatioExceeded` מול הסף הקבוע `VIOLATION_RATIO_THRESHOLD=0.15`.
      נוסף גם `lastCompleteEnvelope` — העוגן ל"lastComplete" של פרוטוקול ההמשכיות ([`PROTOCOLS.md` §5](PROTOCOLS.md#5-פרוטוקול-המשכיות)).
      19 בדיקות: כלל-אחר-כלל, ושני fuzz — (א) כל prefix אפשרי (offset-by-offset) של stream ריאליסטי
      מרובה-מעטפות, (ב) 300 מחרוזות בייטים אקראיות עם PRNG זרוע קבוע (ללא תלות חדשה — אותה מוסכמה
      "לולאה ידנית" שכבר קיימת ב-`packages/ingest`'s ContextBroker property test).
- [x] **P5-T8 · המשכיות** — פרוטוקול [`PROTOCOLS.md` §5](PROTOCOLS.md#5-פרוטוקול-המשכיות).
      *גמור:* פלט שנקטע מושלם ושורשר נכון · עד 3 המשכות · חוסר התקדמות = כישלון · הכל נספר ב-`Ledger`.
      *כפי שמומש:* `packages/core/src/continuation/continuation.ts` — `runWithContinuation` נותב **כל** קריאת
      המשך דרך `runAdmitted` (P4-T3) על דלי `repair` (BUDGET.md §3 קורא לזה בשם: "ניסיונות חוזרים, המשכות,
      תיקוני כשל"), כך שכשל בקריאה משחרר `committed` בלי דליפה (נבדק ישירות). "אין התקדמות" ממומש כהשוואת
      `lastCompleteEnvelope` (מ-P5-T7's parser) בין שני parses עוקבים — זהה → כישלון (`outcome:"no-progress"`),
      בדיוק ה"lastComplete" ש-PROTOCOLS.md §5 מתאר. המשכיות מופעלת **רק** כש-`finishReason==="max_tokens"`
      וגם `!done` — כל סיבת אי-סיום אחרת (`safety`/`other`) מסומנת `"not-truncated"` ומוחזרת לשכבת מדיניות
      הכשל (P5-T11), לא מטופלת כאן. `MAX_CONTINUATIONS=3` נאכף בלולאה; מיצוי 3 ניסיונות בלי `done` מחזיר
      `"max-continuations-exceeded"`. `collectGenerate` (עוזר משותף לשימוש חוזר ב-P5-T6) מרוקן stream
      `AsyncIterable<Delta>` לטקסט+usage+finishReason יחיד, ומתעלם מ-`isThought` deltas (לא חלק מה-NDJSON).
      12 בדיקות מול `MockLLMProvider` (מ-`@ao/providers`, נוסף כ-devDependency בלבד — ללא תלות של קוד
      הייצור ב-`@ao/providers`, לפי אותו כלל שכבות מ-[P1-T1](#p1)) ו-`Ledger` אמיתי: כבר-הושלם/השלמה אחרי
      המשך יחיד/חוסר-התקדמות/3 המשכות ממצות עם התקדמות אמיתית בכל אחת/כשל ספק משחרר reservation/
      finishReason שאינו max_tokens לא מפעיל המשכיות כלל.
- [x] **P5-T9 · `Blackboard`** — מצב משותף + דדופליקציית ממצאים.
      *גמור:* ממצאים כפולים ממוזגים · **סוכן לעולם לא מקבל את כולו** — רק דרך ה-Broker.
      *כפי שמומש:* `packages/core/src/blackboard/` — `dedupe.ts` מממש את שלושת השלבים מ-[`PROTOCOLS.md` §7](PROTOCOLS.md#7-blackboard)
      (נורמליזציה → דמיון לקסיקלי → מיזוג ראיות עם ה-confidence הגבוה): המסמך לא קובע סף דמיון קונקרטי,
      אז נבחר סף Jaccard שמרני (`FINDING_SIMILARITY_THRESHOLD=0.8`) על סטים של טוקנים מנורמלים — תואם את
      אותה מוסכמה "לקסיקלי" שכבר קיימת ב-BM25 של `packages/ingest`. `Blackboard` (`blackboard.ts`) היא
      מחלקת מצב טהורה עם `addFinding` שממזג במקום לשכפל. אכיפת "סוכן לעולם לא מקבל את כולו" **לא** יכולה
      להיות מכנית לגמרי כאן: `packages/core` לא יכול לתלות ב-`@ao/ingest` (חבילת ה-`ContextBroker`) בלי
      להפוך את שכבות התלות שנקבעו כבר ב-[P1-T1](#p1)/[P4-T1](#p4) ("`core` תלוי רק ב-`@ao/shared`") — לכן
      האכיפה מבנית-בתיעוד: `snapshot()` מתועד במפורש כמיועד ל-event sourcing (P5-T12) בלבד, ו-
      `findingsAsContextCandidates()` הוא נתיב הקריאה **היחיד** האחר, ומחזיר פריטים בצורה תואמת-מבנית
      (duck-typed) ל-`ContextItem` של `selectContext` — בלי לייבא את הטיפוס בפועל. חיווט אמיתי מול
      `selectContext` האמיתי הוא עבודת ה-composition root (`apps/runtime`, טרם קיים). נוסף גם
      `Blackboard.fromSnapshot`/`snapshot` round-trip לתמיכה ב-P5-T12. 23 בדיקות.
- [x] **P5-T10 · Reducers** — כל ה-`local:*` מ-[`PROTOCOLS.md` §8](PROTOCOLS.md#8-reducers).
      *גמור:* **טהורים ודטרמיניסטיים** · אותו קלט → אותו פלט bit-for-bit · אפס רשת.
      *כפי שמומש:* `packages/core/src/reducers/` — `local-reducers.ts` מממש `concat-ordered`/`dedupe-findings`/
      `vote`/`assemble-files` כפונקציות סינכרוניות טהורות; `dedupe-findings` ו-`vote` משתמשים **ישירות**
      ב-`findDuplicate`/`mergeFindings`/`isDuplicateClaim` מ-P5-T9 (לא מימוש כפול) כך שדדופליקציה בשלב
      ה-reduce ובזמן כתיבה ל-Blackboard לעולם לא יכולות לסטות זו מזו. `vote` ממומש כרוב-מוחלט על קבוצות
      טענות דומות-לקסיקלית (לא זיהוי סתירה סמנטית — מעבר ליכולת של reducer מקומי ללא רשת); טענה שלא
      עברה רוב הופכת ל-`Gap` ולא נעלמת. `assemble-files` מבצע **רק את החלק הטהור בזיכרון** — איחוד קבצים
      + דיווח על התנגשות path בין שתי Tasks (הגנה כפולה; האכיפה העיקרית היא בזמן פילוח, P5-T5) — **בלי
      לגעת בדיסק**: כתיבה בפועל ל-staging + הרצת הטולצ'יין של הפרויקט כאורקל אימות הם I/O ולכן שייכים
      ל-P8-T3/T4/T6, לא ל-`packages/core` שנשאר "בלי I/O" (README). `reduce-tree.ts` הוא `reduceTree`
      גנרי (מיזוג בינארי-מאוזן, לא לולאה שטוחה) — פרמטרי; נבדק שהוא שומר על סדר שמאל-לימין לצירוף
      לא-קומוטטיבי (concat) ותואם fold רציף לצירוף קומוטטיבי (sum). `llm-synthesize.ts` מממש את
      `llm:synthesize` **כפי שהמסמך עצמו קובע שהוא היוצא-מן-הכלל**: לא טהור/דטרמיניסטי מבחינת המסמך,
      ולעולם לא קורא בעצמו לספק (זה עדיין תפקיד `runWithContinuation`/`collectGenerate` מ-P5-T8, שנשארים
      האחראים היחידים על קריאת LLM אמיתית בתוך `packages/core`) — מחזיר תמיד `needsLlmStitch:true` +
      `stitchScope` מלא + ערך fallback שסופק מבחוץ. 17 בדיקות, כולל קביעה מפורשת שאותו קלט מוחזר bit-for-bit
      זהה (`toEqual` על שתי הרצות עוקבות).
- [x] **P5-T11 · מדיניות כשל** — כל רמות מדיניות הכשל מ-[`ARCHITECTURE.md` §10](ARCHITECTURE.md#10-מדיניות-כשל).
      *גמור:* כל מדיניות נבדקת עם כשל מדומה · **ריצה כושלת עדיין מחזירה תוצר חלקי**.
      *כפי שמומש:* `packages/core/src/failure-policy/` מכסה את הרמות ש-P5 בפועל אחראית עליהן — רמת
      "קריאה" (retry עם jitter על 429/5xx, מודל חלופי) שייכת כולה ל-`@ao/providers`'s `withRetry` (P1-T5),
      אין ל-`core` מה להוסיף שם (מתועד ב-`task-failure.ts`'s הערת הפתיחה). `task-failure.ts`'s
      `nextTaskFailureAction` היא פונקציית החלטה טהורה למדרגות Task: ניסיון-חוזר-עם-הקשר-מצומצם →
      הקצאה-מחדש → דילוג, לפי `attemptsSoFar`. `stage-failure.ts`'s `applyStageFailurePolicy` מיישמת את
      ארבע מדיניות `Stage.onFailure` נגד `StageRunResult` אמיתי מה-Scheduler (P5-T4): `retry` מבקשת הרצה
      חוזרת של השלב; `degrade` שומרת תוצאות מוצלחות והופכת כשלים ל-`Gap`; `skip` **מפילה את כל תוצרי
      השלב**, כולל הצלחות — הבחנה מכוונת מ-`degrade` (המילה "skip" מתייחסת ליחידת השלב, לא רק לדילול);
      `replan` מאותתת ש-P6 (תכנון אדפטיבי) צריך להיכנס לתמונה — לא בהיקף P5. `run-outcome.ts`'s
      `assembleRunOutcome` הוא הצעד הסופי הבלתי-מותנה של הערבות הגלובלית: אף ענף לא זורק ואף ענף לא
      מחזיר `undefined`, כך שכל עוד כל שכבה למעלה (Reducers של P5-T10, שכבר תמיד מחזירים `value` לצד
      `gaps` ולא זורקים) מקיימת את אותה ערבות, שרשרת שלמה לעולם לא יכולה להסתיים ב"כלום" — רק ב-
      `status:"partial"` עם `gaps` שמסבירים בדיוק מה חסר ולמה. בדיקת אינטגרציה ייעודית (`run-outcome.test.ts`)
      מרכיבה Scheduler+stage-failure+`local:concat-ordered`+`assembleRunOutcome` על **ריצה שבה כל Task
      בכל שלב נכשל** ומוכיחה: אף שלב בשרשרת לא זורק, `RunOutcome` תקין מוחזר (`status:"partial"`, `gaps`
      לא ריק), ו-`ledger.openReservationCount === 0` גם אחרי כישלון מוחלט. 12 בדיקות סה"כ.
- [x] **P5-T12 · Event sourcing** — `events.jsonl` + חידוש ([ADR-008](DECISIONS.md#adr-008)).
      *גמור:* הרג התהליך באמצע שלב 3 — הפעלה מחדש ממשיכה מ-3, לא מ-1.
      *כפי שמומש:* `packages/core/src/event-log/` — `EventLog` (`log.ts`) מחלקת log מוסיפה-בלבד בזיכרון
      סביב `RuntimeEvent` הקיים מ-`@ao/shared` ([`PROTOCOLS.md` §9](PROTOCOLS.md#9-אירועי-runtime--ui)),
      עם `seq` עולה שנאכף אך ורק ע"י `append` (הקורא מספק ערך placeholder בלבד). כתיבת/קריאת הקובץ
      `runs/<runId>/events.jsonl` בפועל היא I/O ונשארת אחריות ה-composition root (`apps/runtime`, טרם
      נבנה) — כמו גבול P5-T6/P5-T9; `serialize`/`fromSerialized` הם קידוד/פענוח NDJSON טהורים בלבד.
      `parseEventLog` **סובל קטיעה** (קריסה באמצע כתיבת שורה) — אותה מכניקה בדיוק כמו פרסר ה-NDJSON של
      P5-T7 (שורה אחרונה לא-שלמה נזרקת בשקט, לא נספרת כהפרה), פרסר עצמאי כי הסכמה שונה לגמרי; נבדק גם
      עם fuzz על כל offset אפשרי של log אמיתי. `resume.ts`'s `computeResumePoint` היא ההחלטה הטהורה
      עצמה: שלב עם אירוע `stage.finished` לא רץ שוב; השלב הראשון **בלי** `stage.finished` (כולל שלב עם
      `stage.started` בלי `stage.finished` — בדיוק מקרה הקריסה-באמצע) הוא נקודת ההמשך. ⚠️ **באג שנתפס
      בזמן פיתוח**: הבדיקה הראשונית ל"קריסה באמצע שלב 3" נכשלה כי `runId` הבדיקה (`"run_crash_test"`)
      הכיל `_` בתוך החלק שאחרי `run_` — `RunIdSchema` (`/^run_[A-Za-z0-9]+$/`) דוחה זאת, כך ש-
      `RuntimeEventSchema.safeParse` נכשל בשקט על **כל** האירועים (בדיוק ההתנהגות הנכונה של "זרוק שורה
      פסולה בלי לקרוס" — אבל חשפה קלט בדיקה לא תקין, לא באג במימוש). תוקן ל-`"run_crashtest"`; אומת
      ישירות מול הסכמה לפני התיקון כדי לוודא שזה אכן הגורם. 12 בדיקות, כולל התרחיש המדויק מהגדרת ה"גמור":
      5 אירועים (s1 started+finished, s2 started+finished, s3 started **בלבד**) → serialize → "התחלה
      מחדש" (fromSerialized) → `computeResumePoint` מחזיר `resumeFromStageId: "s3"`, לא `"s1"`.

> **🏁 הדגמת M2:** "נתח את המאגר וכתוב מסמך ארכיטקטורה" על תיקייה אמיתית — 4 שלבים, 14 סוכנים, fan-out מקבילי, מיזוג מקומי, בתוך התקציב.
> *כפי שמומש:* `packages/core/src/integration/m2-scenario.test.ts` — לא תיקייה אמיתית (זו תלויה
> ב-`@ao/ingest` וב-composition root שטרם נבנו), אלא בדיקת אינטגרציה מלאה מול `MockLLMProvider`
> שמרכיבה `runRecon` (P5-T2) → `runPlanner` (P5-T3, עם `validatePlan` P5-T1 שני פעמים — פעם בתוך
> ה-planner ופעם עצמאית על הפלט) → `runScheduler` (P5-T4) עם תוכנית אמיתית של **4 שלבים סה"כ 14
> Tasks** (6+4+3+1, בדיוק המספרים מההדגמה) → כל Task עובר `buildAgentPrompt`/`buildAgentRequest`
> (P5-T6) → `collectGenerate` → `parseNdjson` (P5-T7) → כתיבה ל-`Blackboard` (P5-T9) וגם ל-Reducer
> (`local:dedupe-findings`/`local:concat-ordered`, P5-T10) → `applyStageFailurePolicy` (P5-T11) →
> `assembleRunOutcome`. שני שלבי ה-reader (s1) כוללים בכוונה שתי טענות זהות מ-shards שונים —
> מוכיח ש-Blackboard's דדופליקציה אמיתית פעילה (6 ממצאים גולמיים → 5 ייחודיים), לא רק שהקוד "מתקמפל".
> בתקציב "standard" (2.5M, התואם את הדוגמה ב-[BUDGET.md §6](BUDGET.md#6-סימולטור-עלות-dry-run)):
> `ledger.available > 0` ו-`ledger.openReservationCount === 0` בסוף. המשכיות (P5-T8) לא נכפתה לתוך
> התרחיש הזה בכוונה — כבר מכוסה ביסודיות בבדיקות האינטגרציה העצמאיות שלה מול `Ledger` אמיתי.

---

<a name="p6"></a>
## P6 · צ'קפוינטים ותכנון אדפטיבי `M`

**מטרה:** תוכנית שמתקנת את עצמה בלי לשלם על תכנון מחדש.

- [x] **P6-T1 · שער מקומי** — 6 האותות מ-[`PROTOCOLS.md` §6](PROTOCOLS.md#6-checkpointdecision-ותיקון-תוכנית).
      *גמור:* **חינמי לחלוטין** · אין אות → אפס טוקנים · יש בדיקה שסופרת קריאות ומאמתת 0.
      *כפי שמומש:* `packages/core/src/checkpoint/signals.ts` — `computeCheckpointSignals` היא פונקציה טהורה
      וסינכרונית לגמרי (ללא `Ledger`, ללא `LLMProvider`) שממירה קלט שכבר נאסף ע"י הקורא (פרויקציה שטוחה,
      אותה מוסכמה בדיוק כמו `applyStageFailurePolicy` מ-P5-T11 שצורכת `StageRunResult<T>` בלי לדעת מה `T`)
      לששת הבוליאנים המדויקים מהטבלה. `budgetDrift` משתמש בסף 25% מדויק (`> estimatedTokens × 1.25`);
      `emptyOutput` מוגדר כ"אפס מעטפות" (המסמכים לא נותנים מספר מפורש מעבר ל"סף מינימלי", אז 0 הוא הפרשנות
      המחמירה ביותר שעדיין לא false-positive על תוצר קטן אך תקין); `criteriaMissed` בודק כיסוי-איחוד על פני
      כל ה-Tasks של השלב (קריטריון שסופק ע"י Task **כלשהו** נחשב מכוסה לכל השלב). `gate.ts` (ראו P6-T5) הוא
      מה שבפועל אוכף "אין אות → אפס טוקנים" — קריאה ל-agent אף פעם לא מתבצעת אלא אם `anySignalFired` או
      נקודת חובה; בדיקה ב-`gate.test.ts` סופרת `provider.calls.generate` ומאמתת `0` בדיוק.
- [x] **P6-T2 · סוכן `checkpoint`** — תקציר מצב ≤3K, מודל `cheap`, פלט `CheckpointDecision`.
      *גמור:* התקציר לא חורג מהתקרה לעולם · כלל הצ'קפוינטים מתחת ל-4% מהתקציב.
      *כפי שמומש:* `summary.ts`'s `buildCheckpointStateSummary` ו-`agent.ts`'s `runCheckpoint`, באותה תבנית
      בדיוק כמו `recon.ts`/`planner.ts` (P5-T2/T3): אובייקט JSON יחיד עם `responseSchema:
      CheckpointDecisionSchema`, לא NDJSON. ⚠️ **`packages/core` אין לו טוקנייזר משלו** (אותו גבול שכל מודול
      אחר בחבילה מכבד — `provider.countTokens()` יושב על `LLMProvider`, לא כאן) — התקרה נאכפת דרך הערכה
      שמרנית מקומית (`Math.ceil(length / 2)`, **צפופה יותר** אפילו מהיחס האמפירי שנמדד ב-P3-T9 לעברית
      ‎~2.1‎ תווים/טוקן), כך שהיא **תמיד** מגזימה כלפי מעלה ולעולם לא מפספסת חריגה אמיתית. `buildCheckpointStateSummary`
      מכווץ בהדרגה את סעיף ה-`gaps` (הסעיף היחיד שאורכו לא חסום) ולבסוף חותך קשיח כרשת ביטחון אחרונה —
      בדיקת property עם 5,000 gaps מוכיחה שהתקרה **לעולם** לא נחרגת. `runCheckpoint` בודק במפורש
      `ledger.bucketSnapshot("checkpoints").available` **לפני** `runAdmitted`, בדיוק כמו הלקח מ-`recon.ts`
      שנתפס ב-P5-T2 (ניתוב לדלי לבדו לא אוכף תקרה — `Ledger.commit` בודק רק `available` ברמת הריצה).
- [x] **P6-T3 · תיקון בטוח** — JSON Patch עם **allowlist מסלולים**.
      *גמור:* **בדיקה: patch שמנסה להעלות `budget.total` נדחה ונרשם** · מסלול לא ברשימה → `continue`.
      *כפי שמומש:* `patch.ts`'s `applyPlanPatch` — `isPatchPathAllowed` (קיים כבר ב-`@ao/shared`, שער-צורה
      טהור) הוא רק השכבה הראשונה; המודול הזה מוסיף את הבדיקות ברמת-הערך שהטבלה דורשת מעבר לזה: שלב שכבר
      הסתיים (`completedStageIds`) חסום בכל מסלול, `tokenBudget.hardCap` מותר לזוז רק כלפי מטה (בדיקה מול
      הערך הנוכחי דרך `json-pointer.ts`'s `resolvePointer`), והוספה/הסרה במסלול "שלב שלם" מותרת רק כש-
      `optional: true`. **`budget.total` לא שדה בכלל במסמך ה-Plan** (ר' `plan.ts`'s הערה משלו) — כך שהדוגמה
      מהמסמך נדחית כבר ע"י שער-הצורה, ויש בדיקה ייעודית שמוכיחה זאת. **כל הפאץ' מתקבל/נדחה כיחידה אחת** —
      "וה-Checkpoint מקבל `continue`" במסמך מתאר טרנספורמציה בודדת של החלטה, לא יישום חלקי; פאץ' שנדחה
      **לעולם** לא נוגע במסמך (זהות `===` נבדקת בבדיקות). יישום ה-RFC 6902 עצמו (`json-patch-apply.ts`) הוא
      מימוש עצמי קטן על clone עמוק (אין תלות חיצונית — אותה מוסכמה כמו מחלץ ה-PPTX העצמי מ-P3-T3), עם
      `add`/`remove`/`replace`/`move`/`copy`/`test` מלאים ובדיקות לכל אחד. תוצאת פאץ' מאושר עוברת שוב דרך
      `validatePlan` (P5-T1) לפני שהיא מוחזרת — אף פעם לא מוחזר מסמך שלא אומת.
- [x] **P6-T4 · גרסאות תוכנית** — `plan.vN.json` + דיף.
      *גמור:* כל תיקון מייצר גרסה · הדיף קריא ומוצג ב-UI.
      *כפי שמומש:* `versions.ts`'s `PlanVersionHistory` עוקבת אחרי כל תיקון **שכבר אושר** (רק תוצאות
      `status: "applied"` מ-P6-T3 מגיעות לכאן בכלל — אין דרך לרשום גרסה לשינוי שלא קרה). `diff.ts`'s
      `formatPlanDiff` מייצר שורה קריאה לכל פעולת JSON Patch (`replace /path: old → new` וכו', עם ה"ישן"
      נפתר מהתוכנית הקודמת דרך `resolvePointer`) — בדיוק אותם שני שדות (`patch`+`diff`) ש-
      `PlanAmendedEventSchema` כבר מגדיר ב-`events.ts` (P2-T6/P5-T12), כך שאין ניחוש לגבי הצורה. `diffPlanStages`
      נפרד מטפל בדיף של תכנון-מחדש שלם (P6-T6, אין שם JSON Patch כלל). `planVersionFileName`/`serializePlanVersion`
      הן פונקציות טהורות שמכינות את מה ש-`apps/runtime` יכתוב בפועל ל-`plan.vN.json` — **אין I/O בליבה**,
      אותו גבול בדיוק כמו `EventLog.serialize()` מ-P5-T12.
- [x] **P6-T5 · נקודות חובה** — אחרי recon, אחרי השלב הראשון, לפני סינתזה.
      *גמור:* רצות תמיד גם בלי אות.
      *כפי שמומש:* `gate.ts`'s `runCheckpointGate` הוא הפונקציה היחידה שמחליטה אם לקרוא לסוכן ה-`checkpoint`
      בכלל — `mandatoryPoint` (טיפוס סגור `"after-recon" | "after-first-stage" | "before-synthesis"`, בדיוק
      שלוש הנקודות מהמסמך) עוקף את כל ששת האותות: אם הוא מוגדר, הסוכן נקרא גם כש-`anySignalFired` הוא
      `false` לגמרי. אותה פונקציה בדיוק גם מממשת P6-T1 (קריאה **רק** על אות/חובה) — הבדיקות ב-`gate.test.ts`
      מוכיחות את שני הכיוונים: ללא אות וללא חובה → אפס קריאות; עם חובה וללא אף אות → קריאה אחת, על כל
      אחת משלוש הנקודות.
- [x] **P6-T6 · תכנון מחדש** — `decision: replan` בונה תוכנית חדשה **תוך שימור עבודה שהושלמה**.
      *גמור:* שלבים שהסתיימו לא רצים שוב · תוצריהם נשמרים ב-Blackboard.
      *כפי שמומש:* `replan.ts` — שתי שכבות. `buildReplan` (טהורה) ממספרת-מחדש מועמד ל-Plan שהתקבל בהמשך
      ל-`oldPlan.version`, מריצה עליו שוב `validatePlan` (כי הוולידציה שרצה בתוך `runPlanner` הייתה מול
      המספור העצמי של המועמד, לא מול המספור הסופי), ומחזירה `preservedStageIds` = בדיוק `completedStageIds`
      שהתקבלו — **תמיד**, גם אם התוכנית החדשה כבר לא מכריזה על אותו מזהה שלב בכלל. `runReplan` (אסינכרונית)
      היא הצעד הקונקרטי "בונה תוכנית חדשה": קוראת שוב ל-`runPlanner` הקיים מ-P5-T3 (ללא שינוי) תחת דלי
      `planning` — BUDGET.md §3 כבר כולל "תיקונים" תחת אותו דלי בדיוק, כך שתכנון-מחדש לא ממציא דלי נפרד.
      **"שלבים שהסתיימו לא רצים שוב" נאכף ב-Scheduler עצמו**, לא רק כמוסכמה: `scheduler.ts` (P5-T4) הורחב
      בפרמטר `skipStageIds` — שלב ברשימה מדולג **לפני** כל `admit()`/`runTask` (זה תוסף טהור, ולא נגע
      בהתנהגות הקיימת: השדה `skipped?: true` ב-`StageRunResult` הוא אופציונלי ונעדר, לא `false`, לכל שלב
      שרץ בפועל — 17 הבדיקות הקיימות של P5-T4 ממשיכות לעבור ללא שינוי). `preservedStageIds` מ-`runReplan`
      מוזן ישירות כ-`skipStageIds` ל-`runScheduler`; בדיקת אינטגרציה ב-`replan.test.ts` מריצה את שתיהן
      יחד ומוכיחה ששלב משומר אף פעם לא מגיע ל-`runTask`. שימור התוצרים עצמם ב-Blackboard כבר נכון-מבנית
      (ה-Blackboard, P5-T9, לא נמחק בין תיקוני תוכנית — שום קוד ב-P6 נוגע בו) ולא נבנה מחדש.

> **הגדרת גמור לשלב:** ריצה שנתקלת בקלט גדול מהצפוי מצמצמת fan-out תוך כדי, מסיימת בתקציב, ומראה למשתמש מה השתנה ולמה.
> *כפי שמומש:* `packages/core/src/checkpoint/phase-done.test.ts` מדגים את זה קצה-לקצה בהיקף P6: שלב שחרג
> 60% מההערכה שלו (אות `budgetDrift` אמיתי, לא מפוברק) מפעיל את ה-checkpoint gate, שמחליט `amend` ומצמצם
> את ה-fanout מ-8 ל-4 דרך `applyPlanPatch`, גרסה חדשה נרשמת עם דיף קריא (`replace /stages/0/fanout/count:
> 8 → 4`) ורדוקציה — כל זה תוך שימוש בפחות מ-4% מדלי הצ'קפוינטים ובלי לגעת ברזרבה הנעולה. בדיקה שנייה
> מוכיחה שבלי אות ובלי נקודת חובה אותה נקודת גבול-שלב עולה **אפס** טוקנים.

---

<a name="p7"></a>
## P7 · כלים מקומיים (toolsmith) `M`

**מטרה:** מנוף החיסכון מספר 1 — קוד במקום הקשר.

- [x] **P7-T1 · ארגז חול — הפשטת פלטפורמה** 🪟⚠️ — **סיכון ה-Windows הגדול ביותר בפרויקט.**
      `Sandbox` הוא ממשק עם שלושה מימושים, ולא קוד לינוקס עם טלאים
      ([ADR-013](DECISIONS.md#adr-013), [`ARCHITECTURE.md` §8](ARCHITECTURE.md#8-הרצה-מקומית-מבודדת-packagestools)):

      | | Linux / macOS | Windows (מקורי) | Windows + Docker |
      |---|---|---|---|
      | פסק זמן + הרג עץ תהליכים | ✅ | ✅ `taskkill /T /F` | ✅ |
      | כלא מסלולים (מנורמל-רישיות) | ✅ | ✅ | ✅ |
      | רשימת היתר לחבילות | ✅ | ✅ | ✅ |
      | תקרת זיכרון/CPU | ✅ rlimits | ⚠️ חלקי | ✅ |
      | **חסימת רשת** | ✅ | ❌ **לא ניתן באמינות** | ✅ |

      **ל-Windows אין rlimits, ואין דרך אמינה לחסום רשת לתהליך-בן בלי Job Objects או קונטיינר.**
      לכן ב-Windows המקורי המימוש **מצהיר על יכולותיו** ב-`Sandbox.capabilities`, וה-UI מציג
      באנר קבוע: *"בידוד חלקי — הסקריפטים יכולים לגשת לרשת. להגנה מלאה התקן Docker Desktop."*
      **אסור להתחזות לבידוד שלא קיים.**
      *גמור:* `capabilities` מדווח נכון בכל פלטפורמה · **בדיקות חדירה רצות ב-CI בשלוש הפלטפורמות**
      (רשת, יציאה מהכלא, לולאה אינסופית, פצצת זיכרון, תהליך יתום) · כל בדיקה שלא ישימה בפלטפורמה
      מסומנת `skip` **עם סיבה מפורשת** ולא נעלמת בשקט · הבאנר מופיע ב-Windows ללא Docker.
      *כפי שמומש:* `packages/tools/src/sandbox/` — `Sandbox` (`types.ts`) הוא ממשק טהור
      (`capabilities` + `run()`), עם **שני** מימושים קונקרטיים בשלב הזה — `LinuxSandbox` ו-`DarwinSandbox`
      (שונים זה מזה, לא "לינוקס עם טלאי": ראה למטה) ו-`WindowsSandbox` — ה-Docker-backed השלישי מ-ADR-013
      הוא **P7-T7** (משימה נפרדת ומאוחרת יותר בשלב הזה), לא בהיקף T1; הממשק נבנה כך שהוספתו לא תדרוש
      שינוי בו. ⚠️ **תיקון בזמן פיתוח:** ה-ARCHITECTURE.md §8 מקבץ Linux+macOS יחד כ"✅ בשתיהן" לכל
      השורות — **זו לא הפרשנות שמומשה בפועל**, כי נבדק ישירות (חיפוש רשת) ש-`ulimit -v` (RLIMIT_AS)
      **לא נאכף באמינות ב-macOS** (בעיה ידועה של ה-kernel של XNU; `ulimit -t`/RLIMIT_CPU כן עובד שם) —
      לכן `DarwinSandbox.capabilities.memoryCpuCaps` הוא `"partial"`, לא `"full"` כמו לינוקס; ראה המקור
      בהערת התיעוד של `capabilities.ts`. חסימת הרשת ב-macOS ממומשת דרך `sandbox-exec` (Seatbelt, מובנה,
      אפס תלות נייטיב) לעומת `unshare` בלינוקס — **המימוש ל-macOS לא הורץ בפועל**, אין מכונת macOS
      בסביבה הזו; `LinuxSandbox`/`capabilities.ts`'s הלינוקס-probe כן רץ ואומת במלואו (ראה למטה).
      **חסימת הרשת בלינוקס אינה `unshare -n` הפשוט** אלא `unshare --user --net --map-root-user` —
      אומת ישירות (גם כ-root וגם כ-`nobody` דרך `setpriv`, ראה commit) ש-`unshare -n` לבד דורש
      `CAP_NET_ADMIN` שלמשתמש רגיל אין, ואילו `--user` (יוצר user-namespace חדש קודם, וממפה אליו
      "root" וירטואלי) הוא מה שמאפשר את זה גם למשתמש לא-פריווילגי — לא רק לתהליך שכבר רץ כ-root;
      זו לכן הפקודה שנבדקת ב-`probeCapabilities`/`probeLinuxNetworkNamespace`, לא הנחה. תקרת
      זיכרון/CPU בלינוקס דרך `ulimit -v`/`ulimit -t` (builtin של `/bin/sh`, אפס תלות) — אומתה ישירות
      שהיא **נאכפת** (הקצאת 400MB עם תקרה 64MB זורקת `MemoryError` בפועל, לא רק בתיאוריה).
      תקרת זיכרון/CPU ב-Windows ממומשת כ-`"partial"` דרך סקר תקופתי (polling) של `wmic ... WorkingSetSize`
      וקטילת עץ התהליכים אם חריגה — לא rlimit אמיתי (Node אין לו גישה ל-Job Objects בלי תלות נייטיב,
      אסור ע"פ ADR-012), ולכן `"partial"` ולא `"full"` — יכול לפספס קפיצה מהירה בין דגימות, מתועד
      בהערת הקוד. `WindowsSandbox` **מומש במלואו מול החוזה אך לא הורץ על Windows אמיתי** בסביבה הזו —
      נבדק דרך `spawnFn`/`taskkillFn`/`pollMemoryBytes` מוזרקים (`windows-sandbox.test.ts`), שמוכיחים את
      *הלוגיקה* (taskkill עם `/PID /T /F` בפסק זמן, קטילה כשהסקר חורג, חיתוך פלט) בלי עץ תהליכים אמיתי
      של Windows — מטריצת ה-CI הקיימת מ-[P0-T5](#p0) (`windows-latest`) היא שתריץ את זה נגד `taskkill`/
      `wmic` אמיתיים. הרג עץ תהליכים בלינוקס/macOS דרך `detached:true` (הילד הופך ל-process-group-leader)
      + `process.kill(-pid, "SIGKILL")` — אומת בבדיקת "תהליך יתום" אמיתית (תת-תהליך רקע עם marker ייחודי,
      נבדק עם `pgrep` אחרי הקטילה שהוא באמת נעלם). כלא הנתיבים משתמש ישירות ב-`resolveWithinRoot` הקיים
      מ-[P0-T10](#p0) — לא נכתב מחדש. רשימת היתר לחבילות (`packageAllowlist: true`) מדווחת כאן כיכולת
      ברמת ה-Sandbox, אך האכיפה בפועל (אילו חבילות מותקנות ב-venv) היא תפקיד [P7-T2](#p7), לא של הקובץ
      הזה. 5 פנטסטים אמיתיים רצים על לינוקס בפועל (`linux-sandbox.pentest.test.ts`, כל אחד ב-`describe.
      skipIf` שידלג עם דיווח ברור אם `!isLinux` — לא רלוונטי כרגע כי ה-CI מריץ אותו גם על לינוקס וגם דורש
      את ה-flag הזה כשמריצים על Windows/macOS בעתיד): רשת, יציאה מהכלא, לולאה אינסופית, פצצת זיכרון,
      תהליך יתום — כולם עוברים בפועל בסביבה הזו. הבדיקה היחידה שדולגה בפועל (לא רק "אם הפלטפורמה שונה"
      אלא **גם על לינוקס עצמו**) היא חסימת רשת ב-macOS (`darwin-sandbox.test.ts`'s "network blocking"
      test) — עם סיבה מפורשת בטקסט הבדיקה: אין `sandbox-exec` על לינוקס. 19 בדיקות סה"כ בחבילה.
- [x] **P7-T2 · הרצת Python** 🪟 — `LocalTool` לפי [`PROTOCOLS.md` §11](PROTOCOLS.md#11-localtool).
      גילוי מפרש דרך שכבת ה-`paths` מ-[P0-T10](#p0) (`py -3` ב-Windows) · venv מבודד לכל התקנה ·
      קידוד פלט **`utf-8` מאולץ** (ברירת המחדל של קונסולת Windows היא cp1252 ותשבור עברית).
      *גמור:* stdlib + `pandas`/`numpy` · **פלט עברי תקין ב-Windows** · פלט חורג נחתך ומסומן, לא נעלם בשקט.
      *כפי שמומש:* `packages/tools/src/runtime/python-runner.ts` + `python-venv.ts` — `runPythonTool`
      מקבל `LocalTool`+`Sandbox`, כותב `script.py`+`inputs.json` לספריית עבודה טרייה תחת ה-jail, מריץ דרך
      `ensureVenv` (venv מבודד, ממופתח לפי `sha256(pythonVersion, packages-ממוינים)` — ריצה שנייה עם אותה
      קבוצת חבילות היא cache hit, לא התקנה חוזרת) ומחזיר `ToolResult` (`tool-result.ts`, משותף גם ל-T3).
      גילוי המפרש **הוא** `@ao/platform`'s `discoverPython` (P0-T10) — לא נכתב שוב. **רשימת ההיתר לחבילות
      נאכפת לא ע"י ניתוח סטטי** (טריוויאלי לעקיפה: `importlib.import_module`, `__import__`) **אלא ע"י
      תוכן ה-venv עצמו** — `detectRequestedPackages` (regex על `import`/`from`) הוא רק נוחות להחלטה מה
      להתקין, לא מנגנון האכיפה; נבדק בפועל: סקריפט שמייבא חבילה לא-ברשימה נכשל ב-`ModuleNotFoundError`
      אמיתי כי היא פשוט לא מותקנת. `PYTHONIOENCODING=utf-8`/`PYTHONUTF8=1` מוזרקים תמיד וללא תנאי —
      נבדק round-trip עברי אמיתי (לא רק תיאורטי). ⚠️ **תיקון בזמן פיתוח, לא הונח מראש:** `tool.limits.
      memoryMb` הוא `ulimit -v` אמיתי בלינוקס/macOS, ונבדק **ישירות** ש-`import pandas` לבדו דורש כמה
      מאות MB של כתובות זיכרון וירטואליות רק כדי לטעון את תת-המודולים שלו — תקרה של 256MB זורקת
      `MemoryError` **באמצע ה-import עצמו**, לפני שהסקריפט אפילו רץ; 384MB+ עובד. תועד כהערת אזהרה
      ל-caller בקוד עצמו (לא רק כאן) — `LocalTool` שמייבא `pandas` צריך לבקש ~512MB לפחות, בלי קשר לכמה
      זיכרון הלוגיקה של הסקריפט עצמו צריכה. **מה שנבדק בפועל בסביבה הזו (לינוקס):** stdlib בלבד, עברית,
      pandas+numpy יחד (התקנת pip אמיתית מול PyPI האמיתי — `pypi.org` פתוח דרך ה-proxy של הסביבה, בניגוד
      ל-`ai.google.dev`/`googleapis.github.io` שנחסמו ב-P1-T2/T7), חיתוך פלט, ואכיפת רשימת ההיתר. **מה
      שלא נבדק בפועל:** התנהגות קונסולת Windows בפועל (cp1252) — אין מכונת Windows כאן; מטריצת ה-CI
      הקיימת (`windows-latest`, P0-T5) תריץ את אותה בדיקת round-trip עברי בפועל שם, לא רק את הלוגיקה.
      ⚠️ **תיקון נלווה שנתפס תוך כדי אינטגרציה, רלוונטי לכל `Sandbox`:** `LinuxSandbox`/`WindowsSandbox`
      העבירו את `options.env` **כתחליף מלא** לסביבת התהליך (`env: options.env ?? {}`) — `{}` היה מוחק
      את `PATH`/`HOME` כולם, ושובר את הרצת ה-python מה-venv בפועל. תוקן ל-**מיזוג** מעל `process.env`
      (`{ ...process.env, ...options.env }`) בשני הקבצים — נתפס ע"י בדיקות T2 עצמן שנכשלו, לא הונח מראש.
- [x] **P7-T3 · הרצת Node** — אותם גבולות.
      *גמור:* זהה ל-T2.
      *כפי שמומש:* `packages/tools/src/runtime/node-runner.ts` — אותו מבנה בדיוק (script.js+inputs.json
      בספריית עבודה טרייה, `buildToolResult` משותף), עם שני הבדלים מתועדים בכוונה, שניהם התגלו/אומתו
      אמפירית ולא הונחו: **(1)** אין שלב venv/npm-install — שום מסמך לא ביקש רשימת היתר ל-npm packages
      כמו pandas/numpy ל-Python, אז סקריפט Node נשען רק על ה-builtins שלו (`fs`/`path`/`crypto`), הזמינים
      תמיד בלי שלב התקנה. **(2)** קידוד ה-utf-8 המאולץ (`PYTHONIOENCODING`) **אין לו מקבילה כאן בכוונה** —
      נבדק ישירות ש-Node כותב stdout כ-UTF-8 תמיד כשהוא מנותב לצינור (לא לקונסולה אמיתית, שזה בדיוק מה
      ש-`Sandbox.run`'s `stdio:["ignore","pipe","pipe"]` תמיד עושה) — בעיית ה-cp1252 היא ספציפית לאופן
      שבו Python כותב טקסט לפי locale, לא ל-Node; מוכח בבדיקת round-trip עברי אמיתית, לא רק בהנחה.
      ⚠️ **הבאג המשמעותי ביותר שנתפס בשלב הזה, ולא היה ידוע מראש:** `ulimit -v` **שובר את Node לגמרי**,
      לא רק מגביל אותו — נמדד ישירות: `node -e "console.log(1)"` תחת `ulimit -v 512MB` קורס ב-V8 Fatal
      Error ("Failed to reserve virtual memory for CodeRange") **לפני הרצת שורת קוד אחת**, ורק מ-~1024MB
      ומעלה מצליח בכלל — ללא קשר לכמה זיכרון הסקריפט עצמו צריך, כי V8 שומר מראש נתח גדול של כתובות
      זיכרון וירטואליות. **הפתרון:** ל-`Sandbox.run` מועבר `ulimit -v` עם רצפה קבועה גבוהה (1536MB מעל
      המבוקש) כרשת ביטחון בלבד, וה-cap האמיתי נאכף דרך **`--max-old-space-size`** של V8 (מוזרק כדגל ל-
      `node` עצמו) — נבדק ישירות שזה מייצר קריסה נקייה ("JavaScript heap out of memory") בהקצאה חורגת.
      זו תקרה **צרה יותר** מזו של Python — זיכרון מחוץ ל-heap המנוהל (native buffers) לא מכוסה — והפער
      הזה מתועד בקוד במפורש, לא מוסתר. 5 בדיקות: דחיית runtime שגוי, JSON+inputs.json, עברית, חיתוך פלט,
      וסקריפט שזורק `Error` מדווח כ-`ToolResult` כושל (לא קריסה לא-מטופלת של הקורא).
- [x] **P7-T4 · סוכן `toolsmith`** — מקבל **סכמה, לא תוכן**; כותב סקריפט.
      *גמור:* "כמה קבצים מייבאים את X" נענה על 10K קבצים בפחות מ-5K טוקנים סה"כ.
      *כפי שמומש:* `packages/core/src/toolsmith/toolsmith.ts` — `runToolsmith` בנוי בדיוק לפי התבנית של
      `recon.ts`/`checkpoint/agent.ts` (P5-T2, P6-T2): קריאה יחידה ל-LLM שמחזירה אובייקט JSON מובנה יחיד
      (כאן: `LocalToolSchema` הקיים מ-`@ao/shared`, לא NDJSON של מריץ הסוכן הגנרי P5-T6), עם בדיקת קיבולת-
      דלי מפורשת (`"execution"`, 58% לפי BUDGET.md §3) **לפני** `runAdmitted` — אותו תיקון שנתפס לראשונה
      ב-P5-T2 (`Ledger.commit` בודק רק `available` ברמת הריצה, לא קיבולת דלי ספציפי). **"סכמה, לא תוכן"
      נאכף מבנית**: `ToolsmithRequest` (`{userRequest, dataDescription}`) הוא בדיוק אותה גישה כמו
      `ReconRequest` — אין שדה בחתימה שיכול לשאת תוכן קבצים גולמי. הרצת הסקריפט שנוצר **מוזרקת**
      (`runLocalTool: (tool) => Promise<ToolResult>`) — `packages/core` לא תלוי ב-`@ao/tools` בקוד
      ייצור בכלל, רק כ-devDependency לבדיקות (אותו גבול הזרקה בדיוק כמו `LLMProvider` עצמו, P1-T1;
      תוסף `references`/`devDependencies` תואם ל-`tsconfig.json`/`package.json`). **תרחיש הבדיקה של
      "הגדרת הגמור" נבנה במלואו, לא נרמז:** `toolsmith.test.ts` בונה קורפוס אמיתי בן 10,000 קבצי JS
      על הדיסק (כל קובץ עשירי מייבא `target-module`), מפעיל `MockLLMProvider` (אפס קריאת LLM אמיתית,
      לפי הכלל של TASKS.md) עם תשובה קבועה שמדמה מה ש-LLM אמיתי היה כותב — סקריפט Node קצר שסורק את
      התיקייה — ומריץ אותו **בפועל** דרך `@ao/tools`'s `runNodeTool`+`detectSandbox()` (לא מוק) מול
      הקורפוס האמיתי. נמדד ישירות (לא רק "עובר/נכשל"): הפרומפט+התשובה ביחד עולים **כ-369 טוקנים**
      (לפי נוסחת ה-mock, 0.3 טוקן/תו) — פחות מ-8% מהתקרה של 5,000, כי כל ההקשר שה-LLM ראה הוא תיאור
      סכמה קצר ולא אחד מ-10,000 הקבצים. `ledger.bucketSnapshot("execution").spent` (המדד האמיתי, לא
      הערכה) נבדק ישירות מתחת ל-5,000. 6 בדיקות סה"כ (5 יחידה + תרחיש ה-10K).
- [x] **P7-T5 · ספריית כלים מוכנים** — ספירות, greps, שאילתות AST, סטטיסטיקות, מעברי סכמה.
      *גמור:* המתכנן בוחר מוכן לפני שמייצר חדש · כלים מוכנים עולים אפס טוקנים.
      *כפי שמומש:* `packages/tools/src/library/` — חמישה בוני-כלים טהורים (`tools.ts`, כל אחד מחזיר
      `LocalTool` מוכן עם `source:"registry"`, אף אחד לא קורא ל-LLM): `count-files-matching` (ספירות),
      `grep` (עם תקרת `maxMatches` **נפרדת** מ-`limits.maxOutputBytes` — כך שמספר ה-hits הכולל נשאר אמיתי
      גם כשרשימת ההתאמות עצמה נחתכת, ומדווח `truncatedMatchList` במפורש), `file-stats` (סטטיסטיקות),
      `count-identifier-occurrences` (שאילתות AST), `json-array-to-csv` (מעברי סכמה). ⚠️ **`count-
      identifier-occurrences` הוא תחליף מוצהר, לא AST אמיתי** — regex עם גבולות-מילה (`\b`), לא
      tree-sitter: `packages/tools` לא תלוי ב-`packages/ingest` (ששם יושב ה-`RepoMap` האמיתי מ-P3-T5),
      והוספת תלות כזו היא החלטת ארכיטקטורה בפני עצמה שלא התקבלה כאן — לכן זה לא מבחין משתנה ממחרוזת
      שמכילה את אותה מילה, ולא פותר ייבוא בשם אחר; מתועד בקוד, לא מוסתר. `registry.ts`'s `matchLibraryTool`
      מקבל **union מובנה** (`LibraryIntent`, לא טקסט חופשי) — "המתכנן בוחר" ממומש כהחלטה מובנית שהקורא
      כבר קיבל (איזו פעולה + אילו פרמטרים), לא כסיווג-כוונה מבוסס-LLM (שהיה סותר את "אפס טוקנים") ולא
      כניחוש מבוסס-מילות-מפתח שמתחזה לבינה. **"כלים מוכנים עולים אפס טוקנים" נאכף מבנית, לא רק מתועד:**
      `packages/core/src/toolsmith/toolsmith.ts`'s `runToolsmith` מקבל `libraryTool?: LocalTool` אופציונלי
      — כשסופק, השלוחה הראשונה מריצה אותו ישירות דרך `runLocalTool` **וחוזרת מיד**, בלי לגעת בכלל בקוד
      שקורא ל-`provider.generate` או לדלי `execution`; בדיקה מוכיחה זאת ישירות: `provider.calls.generate`
      נשאר ריק ו-`ledger.bucketSnapshot("execution").spent === 0` כשמסופק `libraryTool`. **מה שלא נבנה
      בשלב הזה, במפורש:** אין עדיין חיווט אמיתי בתוך `planner.ts` (P5-T3) שמחליט אוטומטית "כלי מוכן מול
      יצירת כלי חדש" — `planner.ts` לא מכיר כלל את `LocalTool`/`toolsmith` כרגע; זו אינטגרציה רחבה יותר
      (ככל הנראה שייכת ל-P9, כשממשק התזמור המלא נבנה) שלא נעשתה כאן בלי עיצוב מספק. 7 בדיקות לכלי
      הספרייה (רצות באמת דרך `runNodeTool`) + בדיקה ל"אפס טוקנים" ב-`toolsmith.test.ts`.
- [x] **P7-T6 · שקיפות** — כל הרצה נרשמת: סקריפט, פלט, קוד יציאה, זמן. גלוי וניתן להרצה חוזרת מה-UI.
      *גמור:* המשתמש רואה כל שורת קוד שרצה על המכונה שלו.
      *כפי שמומש:* `packages/tools/src/transparency/tool-run-log.ts` — `ToolRunLog` הוא רשם טהור בזיכרון,
      **אותו תפקיד ש-`EgressLedger` (P3-T10) ממלא לגבי egress**: פרימיטיב שמתאים בדיוק לצורת אירוע ה-wire
      הקיים (`tool.executed` מ-[`PROTOCOLS.md` §9](PROTOCOLS.md#9-אירועי-runtime--ui):
      `{toolId, script, exitCode, durationMs, outputSize}`) — `toToolExecutedEvent()` ממפה ישירות לצורה
      הזו — בלי לנסות לחווט בעצמו שידור WebSocket/פאנל UI אמיתי (זה תפקיד `apps/runtime`/`apps/web`,
      כמו ש-egress panel לא נבנה ב-P3-T10 עצמו). **`record.tool` הוא ה-`LocalTool` המלא**, כולל `script`
      שלעולם לא נחתך — גם כשפלט הריצה עצמו כן נחתך (`truncated`) — זה מה שהופך את "המשתמש רואה כל שורת
      קוד שרצה" לנכון תמיד, לא רק כשהפלט קטן. `runPythonTool`/`runNodeTool` (T2/T3) מקבלים `runLog?`
      אופציונלי ומדווחים **כל** ריצה דרכו (הצלחה או כישלון כאחד) — לא רק ריצות toolsmith: כל LocalTool
      שרץ דרך שני ה-runners האלה נרשם, כולל כלי מהספרייה (P7-T5). "ניתן להרצה חוזרת" ממומש כ-`rerunTool`
      (`rerun.ts`) — מקבל `ToolRunRecord` (שנושא את ה-`LocalTool` המלא) ומנתב ל-runner הנכון לפי
      `tool.runtime`, בלי מנגנון "replay" נפרד שעלול לסטות ממה שבאמת רץ. 8+3 בדיקות: רישום עם script מלא
      למרות חיתוך פלט, runId עולה, `get()`/`list()`, חישוב `finishedAt`, התאמה מדויקת לצורת `tool.executed`,
      ואינטגרציה אמיתית (לא מוק) — הרצה אמיתית → רישום → `rerunTool` → הרצה שנייה אמיתית עם אותו script.
- [x] **P7-T7 · Docker** 🪟 — בידוד חזק. **ב-Linux/macOS אופציונלי; ב-Windows זו הדרך היחידה
      לבידוד רשת מלא** ולכן ה-UI ממליץ עליו שם במפורש.
      *גמור:* מזוהה אוטומטית · נופל חזרה בחן אם לא מותקן · `capabilities` מתעדכן בהתאם.
      *כפי שמומש:* `packages/tools/src/sandbox/docker-sandbox.ts` — `DockerSandbox` הוא מימוש שלישי אמיתי
      של `Sandbox` (ADR-013): `--network none`/`bridge` לחסימת/היתר רשת, `--memory` (cgroup, אכיפה אמיתית
      ברמת הקרנל — `memoryCpuCaps:"full"`, לא `"partial"` כמו Windows/macOS המקוריים), ו-bind-mount **רק**
      של `stagingRoot` ל-`/workspace` (בידוד מערכת קבצים חזק יותר מהבדיקה האפליקטיבית `resolveWithinRoot`
      — עדיין נבדקת גם היא, הגנה כפולה). קטילה בפסק זמן דרך `docker kill <name>`, לא SIGKILL לתהליך —
      זו הדרך הנכונה לעצור קונטיינר (קטילת לקוח ה-CLI לבד הייתה עלולה להשאיר את הקונטיינר רץ ביתמות
      ב-daemon). `detectDockerSandbox()` מחזיר `null` בחן (לא זורק) כש-Docker לא זמין — "נופל חזרה בחן"
      נאכף כחוזה טיפוסים (`DockerSandbox | null`), לא רק כהתנהגות.
      ⚠️ **מה שנבדק כאן באמת מול Docker אמיתי, ומה שלא — חלוקה מדויקת, לא "עבד/לא עבד" גורף:**
      הרצתי בפועל `dockerd` בקונטיינר הזה (אומת: `docker info`/`docker version` מצליחים באמת, לא רק
      `docker --version`) — **גילוי הזמינות אמיתי ולא מדומה**, בניגוד למקרים קודמים בפרויקט (כמו
      `GEMINI_API_KEY` שפשוט לא היה קיים ב-P1-T2) שבהם המנגנון עצמו לא היה זמין לבדיקה כלל. אבל **הרצת
      קונטיינר אמיתית עד הסוף לא הצליחה** — `docker run node:22-slim ...` נכשל במשיכת ה-image כי ה-proxy
      של הסביבה הזו חוסם את ה-CDN של Docker Hub (`production.cloudfront.docker.com`), אותה קטגוריית
      חסימה בדיוק כמו `ai.google.dev`/`googleapis.github.io` שנחסמו ב-P1-T2/P1-T7. לכן `docker-sandbox.
      test.ts` מוכיח את בניית ה-argv המדויקת (`--network`, `--memory`, `-v`, `-w`, מיפוי נתיב תת-תיקייה,
      `docker kill` בפסק זמן, חיתוך פלט, דחיית כלא) דרך `spawnFn`/`spawnSyncFn` מוזרקים — **לא** מוכיח
      שפלט סקריפט אמיתי חוזר נכון מקונטיינר אמיתי, כי הצעד הזה חסום בסביבה, לא דולג מרשלנות.
      **החלטת היקף מפורשת:** `DockerSandbox` **לא** חוברה כברירת מחדל ל-`python-runner.ts`/`node-runner.ts`
      — נתיב ה-venv המוחלט של `ensureVenv` (P7-T2) הוא נתיב על מערכת הקבצים של ה-**host**, וחסר משמעות
      בתוך מערכת הקבצים של קונטיינר; הפיכת ה-runners למודעי-Docker דורשת עיצוב נפרד (התקנת חבילות בתוך
      הקונטיינר, או mount של `site-packages` מול ABI תואם) שלא התקבל כאן בלי מחשבה מספקת — `image`
      חייב לכן לקרוא לזמן-ריצה שכבר **מותקן בתוך** הקונטיינר (`command` הוא שם בינארי בתוך הקונטיינר,
      לעולם לא נתיב host). 11 בדיקות: `probeDockerAvailable` אמיתי מול ה-daemon החי (לא מדומה) + מדומה,
      `detectDockerSandbox` (זמין/לא זמין), capabilities, דחיית כלא, בניית argv מדויקת, מיפוי `-w` לתת-
      תיקייה, `--network bridge` כש-`network:true`, `docker kill` בפסק זמן, חיתוך פלט.

> **הגדרת גמור לשלב:** שאלה כמותית על מאגר של 10K קבצים נענית נכון בפחות מ-10K טוקנים, כשהתשובה הנאיבית הייתה עולה מיליונים.
> *כפי שמומש:* [P7-T4](#p7)'s תרחיש ה-10K-קבצים מדגים בדיוק את זה — נמדד ישירות ~369 טוקנים סה"כ
> (הרבה מתחת גם ל-5K וגם ל-10K), כי ה-LLM רואה רק תיאור סכמה קצר ולא אף אחד מ-10,000 הקבצים עצמם.

---

<a name="p8"></a>
## P8 · פלט גדול וארטיפקטים `L`

**מטרה:** לשבור את תקרת 64K.

- [x] **P8-T1 · סוכן `outliner`** — שלד עם מזהים, מטרות וגדלים צפויים.
      *גמור:* הפלט קטן (<4K) · כל סעיף בעל גודל צפוי מתחת לתקרת הסוכן.
      *כפי שמומש:* `packages/core/src/outliner/outliner.ts` — `runOutliner` בנוי בדיוק לפי התבנית של
      `recon.ts`/`checkpoint/agent.ts`/`toolsmith.ts` (P5-T2, P6-T2, P7-T4): קריאה יחידה ל-LLM שמחזירה
      אובייקט JSON מובנה יחיד (`OutlineSpecSchema`, לא NDJSON), עם בדיקת קיבולת-דלי מפורשת (`"execution"`,
      58%) **לפני** `runAdmitted` — outliner הוא סוכן `worker`-tier (ARCHITECTURE.md §4) שעושה עבודת שלב-0
      של Stage, אותו דלי בדיוק כמו `toolsmith` ומאותה סיבה. **החלטת סכמה מפורשת:** `OutlineSpec`/
      `OutlineSpecSection` (`packages/shared/src/schemas/outline-spec.ts`) הם טיפוס **חדש**, לא הרחבה של
      `blackboard.ts`'s `OutlineSchema` הקיים — כי הפלט הגולמי של ה-outliner חסר `ownerTaskId`/`status`
      (שדות שמוקצים מאוחר יותר, ב-[P8-T2](#p8)) ומחזיק שדות שה-Blackboard's `Outline` לא צריך (`goal`,
      `expectedOutputTokens`, `deliverableKind`, ו-`path` לסעיפי `files` בלבד — union מסוגנן עם
      `z.discriminatedUnion("deliverableKind", ...)` כך שסעיף `markdown` פיזית לא יכול לשאת `path`).
      הרחבת הטיפוס הקיים הייתה דורשת לגעת בשני קבצי בדיקה קיימים מ-P5-T9/P5-T10 בלי תועלת אמיתית — טיפוס
      נפרד הוא הפרשנות הנקייה יותר, ו-[P8-T2](#p8) הוא מה שהופך `OutlineSpecSection` ל-`OutlineSection`
      (מוסיף `ownerTaskId`+`status`). **שני הביקורות של "גמור" נאכפות בפועל, לא רק מתועדות:** תקרת ה-4K
      של הפלט עצמו נבדקת מול `usage.candidatesTokens` **האמיתי** שחוזר מה-provider (לא הערכה) — נבדק עם
      תשובת mock גדולה בכוונה (400 סעיפים) שחוצה את הסף בפועל; וגודל צפוי לכל סעיף נבדק מול תקרת סוג
      הסוכן הבעלים (`writer`/`coder`, מסופקות ע"י הקורא כ-`SectionOwnerCaps` — `core` אין לו רישום סוכנים
      משלו, כמו בכל מקום אחר בחבילה). שתי הבדיקות רצות **בתוך** ה-callback של `runAdmitted` (לא אחריו) —
      כשל בהן משחרר (`release`) את ה-reservation במקום ליישב אותו (`settle`), אותה מוסכמה בדיוק כמו כשל
      פרסור/סכמה ב-`recon.ts`/`toolsmith.ts`. 7 בדיקות: פלט תקין · שיוך לדלי execution בלבד · חריגת
      קיבולת-דלי נדחית לפני קריאה לספק · JSON לא-תואם-סכמה משחרר reservation · סעיף חורג-תקרה נדחה · פלט
      שעצמו חוצה 4K (עם בדיקת-שפיות מפורשת שהתרחיש אכן חוצה את הסף) נדחה למרות שהוא תקף-סכמה.
- [x] **P8-T2 · פילוח לפי שלד** — בעלות בלעדית לכל סעיף/קובץ.
      *גמור:* **אף סעיף בלי בעלים · אף סעיף עם שני בעלים** — נאכף בזמן הפילוח.
      *כפי שמומש:* `packages/core/src/sharding/outline-shard.ts` — **החלטת עיצוב מפורשת: מרחיב את
      `packages/core/src/sharding/` הקיים (P5-T5), לא מכפיל את לוגיקת ה-fan-out.** `planSectionOwnership`
      עוטף את `buildShards`/`verifyShards` (`shard.ts`) הקיימים: קריאה ל-`buildShards(items, items.length)`
      מנוונת את חלוקת ה-N-way הכללית (bin-packing מאוזן-משקל) למקרה הפרטי "שלד אחד לכל סעיף" — הוכחה
      באינדוקציה בהערת הקוד: כש-`count === groups.length` וכל שלד מתחיל במשקל 0, השלב החמדני "מקם בשלד
      הקל ביותר" תמיד ממקם את הקבוצה הבאה בשלד שעדיין לא נגע בו, עד שלכל שלד יש בדיוק פריט אחד. זו הפרשנות
      של "בעלות בלעדית לכל סעיף/קובץ" (ARCHITECTURE.md §6) — מקרה פרטי מחמיר של sharding, לא מנגנון נפרד.
      **האכיפה בפועל, לא רק תיעוד:** `verifyShards`'s violations (`not-covering`/`not-disjoint`/
      `shared-file`) נבדקים ו**נזרקים** (`SchemaValidationError`) בתוך `planSectionOwnership` עצמו — קורא
      שמתעלם מהחריגה לא יכול לקבל תוכנית עם סעיף לא-מבועל או מבועל-כפול; בדיקה ייעודית מדגימה בדיוק את
      התרחיש הזה (שני סעיפי `files` שונים שמצהירים על אותו `path`) ומוודאת שהיא נכשלת. `toShardItem` ממפה
      `OutlineSpecSection.path` (רק לסעיפי `files`) ל-`ShardItem.path` — אותו שדה בדיוק ש-`verifyShards`
      כבר בודק ל"shared-file", כך שההגנה על בעלות-קובץ-בלעדית של P5-T5 מוחלת ישירות בלי קוד חדש. `attachOwnership`
      הופך `OutlineSpec` (P8-T1, ללא `ownerTaskId`/`status`) ל-`Outline` בצורת ה-Blackboard (P5-T9) — מצרף את
      שני השדות שה-outliner לא יכול לדעת מראש; נבדק round-trip מלא דרך `OutlineSchema.parse`. 6+2 בדיקות.
- [x] **P8-T3 · `Assembler`** — הרכבה לפי סדר השלד + אימות שלמות.
      *גמור:* סעיף חסר מייצר **משימה חוזרת ממוקדת**, לא כישלון של הכל.
      *כפי שמומש:* `packages/core/src/assembler/assembler.ts` — `assembleOutline` **לא** מכפיל את לוגיקת
      המיזוג: מפצל את סעיפי ה-`OutlineSpec` (P8-T1) לפי `deliverableKind` וקורא ישירות ל-`local:concat-ordered`
      ול-`local:assemble-files` הקיימים (P5-T10) לכל חצי. התוספת האמיתית של המשימה הזו — הדבר ששני
      ה-reducers הקיימים **לא** עושים בעצמם — היא בדיקת שלמות בצד ה-`files`: `assembleFiles` (P5-T10) אינו
      מקבל בכלל את ה-outline ולכן מדווח רק על **התנגשות** נתיב, לעולם לא על נתיב שהשלד הבטיח ושאף task
      לא הפיק. **החלטת עיצוב מפורשת:** זיהוי "סעיף חסר" (גם ל-markdown וגם ל-files) נעשה כאן **ישירות**
      — השוואת מזהי/נתיבי סעיפי השלד מול מה שבאמת הופק — ולא ע"י פרסור טקסט חופשי מתוך `Gap.description`
      של `concatOrdered`; זו בדיקה מובנית וסימטרית בין שני הסוגים במקום התאמת-מחרוזות שברירית. (התוצאה:
      ה-gaps של `concatOrdered` על סעיף חסר מוצנחים מהפלט הסופי כי הם כפולים בדיוק לחישוב העצמאי הזה —
      מתועד בהערת קוד — בעוד gaps של התנגשות-נתיב מ-`assembleFiles` כן נשמרים, כי הם מידע נוסף אמיתי.)
      כל סעיף חסר (משני הסוגים) הופך ל-`RetryTask` הנושא את הגדרת השלד המקורית **המלאה** (goal,
      deliverableKind, path, expectedOutputTokens) — לא רק "נכשל" — עם `taskId` שנגזר מה-owner המקורי
      (מ-`planSectionOwnership`, P8-T2) בתוספת `#retry`, כך שקל לעקוב מאיזה ניסיון ראשון זה ממשיך. קבצי
      הפלט מסודרים מחדש לסדר השלד (P5-T10's `assembleFiles` עצמו סדר-אדיש, אין בו שינוי). "אימות שלמות"
      של hash כבר קיים ב-P5-T7 (הפרסר לא מחזיר קובץ עם hash שגוי מלכתחילה) — לא שוכפל כאן. 6 בדיקות:
      הרכבה מלאה ללא gaps · סדר קבצים נכון גם כשה-inputs מגיעים בסדר הפוך · סעיף markdown חסר → retry
      ממוקד · סעיף files חסר → retry נושא path נכון · כל השלד חסר → תוצר-חלקי בלי לזרוק, 4 retry tasks ·
      התנגשות נתיב מוצגת כ-gap בלי ליצור retry מיותר (זו לא "חסר").
- [x] **P8-T4 · אימות מקומי** — קוד: `tsc`/lint/tests של הפרויקט. מסמך: כותרות, הפניות, כפילויות, מונחים.
      *גמור:* **הטולצ'יין של הפרויקט עצמו הוא האורקל** · אפס טוקנים.
      *כפי שמומש:* `packages/core/src/validation/` — שני קבצים, כל אחד עם החלטת-היקף שונה ומתועדת:
      **מסמכים** (`document-validate.ts`) — פונקציה טהורה, בלי I/O ובלי הזרקה בכלל: `validateDocument`
      עובד ישירות על `SectionResult[]` (לא על מחרוזת מורכבת אחת) כי **כל חריגה נושאת `sectionIds`** — מיקום
      צר שמוזן ישירות ל-scope של [P8-T5](#p8), לא רק "יש בעיה במסמך". ארבע בדיקות: קפיצת רמת כותרת בתוך
      סעיף, כותרת כפולה בין שני סעיפים, הפניה צולבת שבורה (אנקור שלא תואם אף כותרת סעיף אחרי slugify),
      ועקביות מונחים. **מונחים ממומש בשני מעברים** (מתועד בקוד כי לא מובן מאליו): מעבר ראשון מסמן אילו
      מונחים "מעניינים" (acronym כל-קפיטל או compound עם אות גדולה פנימית, כמו `GitHub`/`API`) — כדי לא
      לתפוס קפיטליזציה רגילה בתחילת משפט כ-false positive; מעבר שני סורק **כל** מילה רגילה במסמך מול קבוצת
      המונחים המסומנים, כדי לתפוס גם צורה "רגילה"-למראה כמו `Github` (אות גדולה יחידה) שלא הייתה מסומנת
      לבד. **קוד** (`code-validate.ts`) — **החלטת היקף מפורשת, לא רק תיעוד**: לא עובר דרך `Sandbox` של
      `@ao/tools` (P7) — הארגז חול הזה נבנה עבור *סקריפט שהמודל כתב*, שההתנהגות שלו לא ידועה מראש וצריך
      בידוד. כאן הפקודות עצמן קבועות וידועות (`tsc`/lint/test), רק *קובצי המקור* לא מהימנים — ו-`tsc` בפרט
      לא מריץ קוד, הוא רק בודק טיפוסים; ניתוב פקודה קבועה דרך מנגנון בידוד-סקריפטים-שרירותיים הוא חוסר-התאמה,
      לא הגנה נוספת. הרצת הפקודה עצמה **מוזרקת** (`RunCommand`) — אותו גבול הזרקה בדיוק כמו `LLMProvider`/
      `RunLocalTool` בכל שאר החבילה — כך ש-`packages/core` נשאר I/O-free. **נבדק גם מול `tsc` אמיתי, לא רק
      מוק**: קורפוס TS אמיתי על דיסק (קובץ תקין + קובץ עם שגיאת טיפוס אמיתית), מורץ דרך `node_modules/.bin/tsc`
      האמיתי של המונורפו עצמו (`execFile` אמיתי, לא מדומה) — מוכיח שה-exit code וניתוח הנתיב (`path(line,col)`)
      עובדים על פלט tsc אמיתי, לא רק על טקסט מדומה שניחשתי את הצורה שלו. אפס טוקנים נאכף מבנית — אין אף
      קריאה ל-`LLMProvider` בשני הקבצים, לא רק שאינה מבוצעת בפועל. 9+6 בדיקות.
- [x] **P8-T5 · תפירת תפרים** — LLM **רק** על תפר שנכשל, לעולם לא על התוצר כולו.
      *גמור:* היקף התפירה מוגבל ונרשם · תוקצב מ-`reserve`.
      *כפי שמומש:* `packages/core/src/reducers/seam-stitch.ts` — **החלטת עיצוב מפורשת: `runSeamStitch` הוא
      הצד ה"מבצע" ל-`llm-synthesize.ts`'s (P5-T10) צד ה"מסמן".** `makeLlmSynthesizeReducer` הקיים נשאר
      בדיוק כמו שהוא — טהור, אף פעם לא קורא לספק, רק מדגל `needsLlmStitch` עם `stitchScope` שהוא **כל**
      ה-taskIds שהזינו את הצמצום (אין לו scope צר משלו כי אין לו מה לצמצם). `runSeamStitch` הוא קובץ אחות
      חדש **באותה תיקייה** (לא הרחבה של `llm-synthesize.ts` עצמו, כי החוזה שונה מהותית: זה כן קורא לספק,
      כן מוציא תקציב אמיתי) שמופעל אחרי ש-[P8-T4](#p8) כבר איתר violation עם `sectionIds`/`filePaths` צרים.
      **"מוגבל" נאכף פעמיים, לא רק בפרומפט:** `assertBoundedSeamScope` בודק **לפני** כל הוצאת תקציב (תפר
      ריק נדחה, תפר מעל `MAX_SEAM_SPAN=3` נדחה, תפר שמכסה את **כל** המסמך נדחה גם אם הוא טכנית קטן מ-3 —
      נבדק מפורשות עם מסמך של 2 סעיפים); ואז **שוב** אחרי החזרת התשובה — כל מזהה שהמודל מחזיר ומחוץ ל-scope
      המבוקש מפיל את הקריאה כולה (לא מוחל בחלקו, לא מתעלמים ממנו בשקט) — כי בקשה בפרומפט היא בקשה, לא
      הבטחה; רק בדיקה מבנית על המזהים שחזרו בפועל היא ערובה. `targets` חייב לכסות **בדיוק** את
      `violation.sectionIds` (לא פחות, לא יותר) — קורא שמנסה להבריח scope רחב יותר דרך `targets` נדחה גם
      הוא. **"תוקצב מ-`reserve`" נאכף במנגנון ייעודי:** `runFromReserve` (מקומי לקובץ הזה, לא נוסף ל-P4's
      `ledger/admission.ts` שכבר "גמור") מראה את אותה צורת settle-בהצלחה/release-בכישלון בדיוק כמו
      `runAdmitted`, אבל בנוי על `Ledger.drawFromReserve` (P4-T1/T5) ולא על `admit`/`commit` — כי `reserve`
      **לא** חבר ב-`BudgetBucketId` (`ledger/types.ts`), אז `runAdmitted` הרגיל פשוט לא יכול למקד אליו.
      **"נרשם"** — `StitchLogEntry` נושא `sectionIds`, `reason` (טקסט ה-violation), `tokensSpent` **האמיתי**
      מ-`Ledger.settle`'s `SettlementResult` (לא ה-`worstCase` המבוקש), ו-`clamped` (מ-`reservation.clamped`,
      BUDGET.md §5 דרגה 8) — כדי שקורא ידע אם התפירה קיבלה פחות ממה שביקשה. 12 בדיקות: תפר תקין מוצלח +
      חיוב מ-reserve בלבד (לא execution/synthesis) · תפר רחב מדי נדחה **לפני** כל קריאה לספק · targets
      חסר/עודף נדחה · תשובה שנוגעת מחוץ ל-scope נדחית ומשחררת reservation · `clamped:true` אמיתי כש-reserve
      כמעט ריק · דרגה 8 **לעולם לא זורקת** גם עם תקציב זעיר. 3 בדיקות סכמה ל-`SeamStitchResponseSchema`
      (`packages/shared/src/schemas/seam-stitch.ts`, חדש).
- [x] **P8-T6 · כתיבת ארטיפקטים** 🪟 — staging, נורמליזציית מסלול, חסימת traversal, בדיקת `sha256`,
      ו**ולידציית שמות לפי כללי Windows — נאכפת בכל הפלטפורמות**:
      שמות שמורים (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`, גם עם סיומת: `aux.ts`) ·
      תווים אסורים (`< > : " | ? *` ובתי בקרה) · סיום בנקודה או ברווח · מגבלת 260 תווים.
      **הסוכנים מייצרים את שמות הקבצים, ולכן זו נקודת כשל אמיתית** — אכיפה גם בלינוקס מבטיחה
      שהיא נבדקת אצל כל מפתח ולא מתגלה רק אצל המשתמש.
      *גמור:* מסלול שיוצא מהשורש נדחה · `sha256` לא תואם → הקובץ נדחה ·
      **בדיקת יחידה עם קורפוס שמות בעייתיים עוברת בשלוש הפלטפורמות** · שם פסול מייצר
      הצעת שם חלופי לסוכן, לא קריסה.
      *כפי שמומש:* `packages/core/src/artifacts/` — `filename-validate.ts` (ולידציית שמות, טהורה) +
      `artifact-writer.ts` (`stageArtifact`, מזריק `writeFile`, אותו גבול הזרקה בדיוק כמו `RunCommand`
      ב-[P8-T4](#p8)). **החלטת עיצוב מפורשת: כלא הנתיבים נכתב מחדש מקומית ולא מיובא מ-`@ao/platform`'s
      `resolveWithinRoot` הקיים (P0-T10)** — למרות שהלוגיקה כמעט זהה, `packages/core` תלוי רק ב-`@ao/shared`
      (הכלל שנקבע ב-P1-T1/P4-T1); `@ao/platform` הוא חבילת-עלה כמו `@ao/shared` עצמו, אבל הוספתו כתלות
      שנייה אמיתית עדיין הייתה תקדים ראשון — וההיגיון עצמו קטן מספיק (~30 שורות) לשכפול ובדיקה עצמאית
      במקום למתוח את הגבול. אכיפת שמות שמורים/תווים אסורים היא **בלתי-תלויה ב-`process.platform`
      במפורש** — אותה עמדה הגנתית בדיוק כמו `resolveWithinRoot`'s "case-insensitive ללא קשר למערכת
      ההפעלה המארחת" — ולכן חבילת הבדיקות (רצה רק בלינוקס בסביבה הזו) מייצגת נאמנה גם Windows/macOS: אין
      כלל הסתעפות לפי OS בקוד. ⚠️ **שני באגים אמיתיים שנתפסו ע"י הבדיקות עצמן, לא הונחו נכונים מראש:**
      (1) `fixSegment`'s `.replace(FORBIDDEN_CHARS_PATTERN, "_")` היה מחליף רק את ההתאמה **הראשונה**
      (חסר דגל `g`) — `a<b>c.ts` היה מייצר הצעה `a_b>c.ts` (עדיין פסולה!) במקום `a_b_c.ts`; (2) חסימת
      ה-traversal המקורית פשוט "clamp"-ה `..` שמנסה לצאת מעל השורש (pop על stack ריק היה no-op שקט) —
      `"../../etc/passwd"` מול שורש `/staging/run1` היה **מתקבל בשקט** כ-`/staging/run1/etc/passwd` במקום
      להידחות; תוקן ל-דגל `escaped` שנדלק ברגע שמנסים לעשות `pop` על stack ריק, ונשאר דלוק גם אם סגמנטים
      מאוחרים "מתקנים" את המחרוזת. **הפרדת אחריות מכוונת:** `.`/`..` הם תחביר ניווט, לא שם קובץ —
      `filename-validate.ts` מדלג עליהם לגמרי (במקום לתייג `..` בטעות כ"trailing dot") ומשאיר את חסימת
      ה-traversal אך ורק ל-jail-check של `artifact-writer.ts`. שגיאות `ArtifactPathError`/
      `ArtifactHashMismatchError` הקיימות מ-P0-T8 **לא** משמשות כאן כ-throw — `stageArtifact` **אף פעם
      לא זורק** על נתיב פסול/traversal/hash לא תואם, מחזיר תוצאה מובנית במקום, אותה מוסכמה בדיוק כמו
      `extractArtifact` (P3-T3) ו-`runCodeValidation` (P8-T4). 44 בדיקות: קורפוס שמות שמורים מלא (עם/בלי
      סיומת, כל הרישיות) · תווים אסורים · בתי בקרה · נקודה/רווח סופי · תקרת 260 · הצעת שם חלופית **שתמיד
      תקפה בעצמה** (נבדק round-trip) · traversal בכל הצורות (ישיר, מוסתר עמוק, "תיקייה אחות" עם prefix
      משותף) · sha256 לא תואם · אף אחד משלושת מסלולי הדחייה לא קורא ל-`writeFile`.
- [x] **P8-T7 · כתיבה לתיקייה** — diff → אישור מפורש → כתיבה עם גיבוי.
      *גמור:* **אף פעם לא שקטה** · גיבוי לכל קובץ שהוחלף · כבוי כברירת מחדל ([Q3](DECISIONS.md#q3--כתיבה-לתיקייה-של-המשתמש--עד-כמה-אגרסיבית)).
      *כפי שמומש:* `packages/core/src/artifacts/text-diff.ts` + `folder-write.ts`. **דיף מינימלי, לא ספרייה**:
      אין שום חבילת `diff` בכל המונורפו, ו"תצוגת diff קריאה למסך אישור" לא דורשת אלגוריתם ברמת word-diff —
      LCS קלאסי (`O(n·m)` באורך שתי הקבצים), מתועד ככזה במפורש (אותה גישת "לא הכי מתוחכם, אבל מכוון
      ומוצהר" כמו ה-`count-identifier-occurrences` הרגקסי מ-P7-T5). `writeToFolder` אוכף שתי שערות
      **נפרדות ומפורשות**: `enabled` (המתג הגלובלי מ-[Q3](DECISIONS.md#q3--כתיבה-לתיקייה-של-המשתמש--עד-כמה-אגרסיבית),
      `DEFAULT_FOLDER_WRITE_ENABLED = false` כקבוע נבדק, לא רק תיעוד) ו-`approved` (אישור מפורש **לכתיבה
      הספציפית**, נפרד מהדלקת הפיצ'ר) — הפעלת הפיצ'ר פעם אחת **לא** מאשרת אף כתיבה בפועל. **"אף פעם לא
      שקטה" נאכף מבנית ע"י צורת ה-Outcome עצמה**: כל נתיב קוד מחזיר גם `diff` (גם כשלא נכתב כלום — כדי
      שאפשר להראות למשתמש "ככה זה היה נראה, אבל..." ) וגם או `wrote:true`+`backupPath?` או `wrote:false`+
      `reason` מפורש (`"disabled"`/`"not-approved"`) — אין צורת החזרה ריקה שאין בה מידע. גיבוי מתבצע **רק**
      כשיש תוכן קיים (`readExisting` מחזיר משהו שאינו `null`) — קובץ חדש לגמרי לא מקבל גיבוי, כי אין ממה
      לגבות; בדיקה מוודאת גם שהגיבוי קורה **לפני** הדריסה (סדר הקריאות ל-mock מוזרק, לא רק שקרה בסוף).
      13 בדיקות (7 ל-`text-diff.ts` כולל דטרמיניזם ומקרי context/added/removed/מעורב, 6 ל-`folder-write.ts`).
- [x] **P8-T8 · תצוגות ארטיפקט** — קוד, Markdown, תמונה, טבלה ל-CSV, דיף, ZIP.
      *גמור:* תצוגה לכל סוג נפוץ · הורדה בודדת וקבוצתית.
      *כפי שמומש:* `apps/web/src/components/artifacts/` — `ArtifactCard` (UX.md §6's "כרטיס ארטיפקט") +
      `ArtifactGroup` (הורדה קבוצתית) + `viewers/` (Diff, Image, Table, Zip). **החלטת עיצוב מפורשת: `דיף`
      אינו חבר ב-`ArtifactViewerKind` — הוא שכבה נוספת מעל תצוגת הבסיס, לא סוג תצוגה בפני עצמו**, בדיוק
      כפי ש-UX.md §6 מנסח את זה ("דיף מול המקור **אם זה עדכון**"); `ArtifactCard` מציג `DiffViewer` כסקשן
      נוסף כש-`diffText` סופק, בלי קשר לסוג הבסיס. `CodeViewer` **לא נכתב מחדש** — `ArtifactCard` משתמש
      ישירות ב-`CodeBlock` הקיים (P2-T5), ו-`MarkdownViewer` הוא `Markdown` הקיים (P2-T5) — אפס כפילות עם
      התשתית שכבר קיימת מ-M1. `DiffViewer` מרנדר **טקסט unified-diff מוכן** (אותה צורה בדיוק ש-`@ao/core`'s
      `formatUnifiedDiff`, P8-T7, מייצר) — לא מחשב דיף בעצמו: `packages/core` תלוי ב-`node:crypto`
      (מותר, חישוב טהור) אבל `apps/web` הוא אפליקציית דפדפן טהורה, אז חישוב הדיף נשאר תמיד בצד השרת.
      **"הורדה קבוצתית" ממומשת בצד הלקוח**: `downloadFilesAsZip` (`fflate`, כבר תלות בפרויקט דרך
      `packages/ingest`) מארזת בדפדפן בלי round-trip לשרת על בייטים שכבר קיימים אצל הלקוח. `TableViewer`
      כולל גם `parseCsv` (לא רק `rowsToCsv`) — מאפשר תצוגת טבלה אמיתית לארטיפקט `.csv`/`.tsv` שכבר קיים,
      לא רק המרה חד-כיוונית. **נבדק בדפדפן אמיתי, לא רק jsdom**: הורם שרת `vite dev` זמני, ונבדק עם
      Playwright/Chromium אמיתי — כולל אירועי `download` אמיתיים (לא מדומים) לשלוש כפתורי ההורדה (קובץ
      בודד, ZIP קבוצתי, CSV) עם שמות קבצים נכונים, וצילומי מסך שמאמתים רינדור נכון (כולל RTL, syntax
      highlighting אמיתי, וטוגל הדיף). קובצי ה-harness הזמניים נמחקו לפני הקומיט — אינם חלק מהאפליקציה.
      70 בדיקות (jsdom + testing-library): סיווג סוג-תצוגה, CSV round-trip, ZIP אמיתי (fflate) עם בדיקת
      תוכן בייט-לבייט, כל viewer בנפרד, ו-`ArtifactCard`/`ArtifactGroup` כולל ניתוב נכון של write-to-folder
      לפריט הנכון בקבוצה.
- [x] **P8-T9 · ממשקים משותפים** — שלב מקדים מייצר טיפוסים משותפים לפני שלב קוד.
      *גמור:* סוכנים מייבאים ואינם מגדירים מחדש · נכנס ל-`Contract Block` הממוטמן.
      *כפי שמומש:* `packages/core/src/artifacts/shared-interfaces.ts` — שתי פונקציות טהורות, תואמות
      בדיוק לשני המשפטים ב-ARCHITECTURE.md §6: `buildContractBlockAddendum` עוטפת את קובץ הטיפוסים
      המשותף לטקסט שנכנס ל-`ContractCache` (P1-T8) — ממוטמן פעם אחת לשלב, נשלח לכל Task ב-fan-out, לא
      פעם לכל סוכן; ו-`detectSharedInterfaceViolations` תופסת שני מצבי כשל **נפרדים** ומדווחת אותם
      כטיפוסים שונים: `redefined-symbol` (קובץ מגדיר מחדש סמל שכבר קיים בשלד) ו-`missing-import` (קובץ
      **משתמש** בסמל בלי כלל לייבא מקובץ השלד — לא רק "לא מייבא", אלא "מבטיח סמל בלי מקור"). **חילוץ
      סמלים הוא רגקס על הכרזות `export` ברמה עליונה, לא AST אמיתי** — מתועד כהמשך מודע לאותה החלטה
      שכבר התקבלה ב-P7-T5 (`count-identifier-occurrences`): `packages/tools` (מקום ה-AST-ish הקודם) לא
      תלוי ב-`packages/ingest` (שם יושב ה-`RepoMap` האמיתי מבוסס tree-sitter), והוספת תלות חוצת-חבילות
      כזו בשביל בדיקה יחידה כאן היא החלטת ארכיטקטורה בפני עצמה שלא התקבלה. קובץ שלא נוגע כלל בסמל
      משותף כלשהו — לא מיובא ולא בשימוש — **לא** מסומן; זו לא דרישה ש"כל קובץ חייב לייבא את השלד", רק
      "אל תגדירו מחדש ואל תניחו סמל בלי לייבא אותו". 7 בדיקות: מקרה נקי (import תקין, אפס אזהרות) ·
      redefine נתפס · missing-import נתפס · קובץ לא-קשור לא מסומן בטעות · הקובץ המשותף לא בודק את עצמו ·
      ריבוי סמלים מייצר violation נפרד לכל זוג (סמל, קובץ).

> **הגדרת גמור לשלב:** יצירת פרויקט רב-קבצי (>150K טוקנים סה"כ) שעובר `tsc` ובדיקות — כשאף סוכן לא כתב יותר מ-16K.
> ⚠️ **לא הודגם קצה-לקצה בשלב הזה** — P8-T1..T9 מומשו ונבדקו כל אחד בנפרד (יחידה, כולל שתי אינטגרציות
> אמיתיות: `tsc` אמיתי ב-[P8-T4](#p8), דפדפן Chromium אמיתי דרך Playwright ב-[P8-T8](#p8)), אבל אף
> משימה לא חיברה את כל השרשרת (outliner → sharding → סוכני writer/coder אמיתיים → assembler → validation
> → stitching → כתיבה) לריצה אחת מקצה-לקצה על פרויקט אמיתי מעל 150K טוקנים — אין עדיין Scheduler/Runner
> שמחבר את הכל (זה תפקיד P9). ההדגמה קצה-לקצה שייכת לשלב שבו התזמור המלא קיים.

---

<a name="p9"></a>
## P9 · 🏁 ממשק תזמור מלא `L`

**מטרה:** להפוך מנוע לכלי. מימוש מלא של [`UX.md`](UX.md).

- [x] **P9-T1 · כפתור מטרה** — [`UX.md` §3](UX.md#3-כפתור-המטרה) במלואו, עם עלות חיה ושמירה לשיחה.
      *גמור:* כל שדה משפיע בפועל על ההרצה · ה-$ מתעדכן מטבלת המחירים.
      *כפי שמומש:* `GoalConfigSchema`/`OverrunPolicySchema` חדשים ב-`packages/shared/src/schemas/goal-config.ts`
      (הראשונים מסוגם — אין להם קודם קיים, בניגוד לרוב הסכמות של P0-P8). `apps/web/src/components/goal/GoalButton.tsx`
      (טריגר+Dialog, ל"תגית על התיבה מציגה את המצב הנוכחי") ו-`GoalForm.tsx` (כל שדות UX.md §3 — 4 רמות
      תקציב, מאמץ, מדיניות חריגה, ומקטע "מתקדם" עם `<details>`) מרכיבים את הפיצ'ר. **החלטת ארכיטקטורה
      מרכזית:** כדי שהעלות תתעדכן מ**אותה** טבלת מחירים אמיתית (`packages/providers/src/models.ts`, לא
      עותק ב-UI) והמגבלות הנגזרות (`BUDGET_LEVEL_MAX_PARALLEL`/`MAX_RUNG`/`BLOCKS_ENSEMBLE`,
      `packages/core/src/plan/types.ts`) לא יוכלו לסטות מהוולידטור שינ P9-T3 ישתמש בו — הוספתי **ייצוא
      תת-נתיב** ל-`package.json` של שתי החבילות (`@ao/providers/models`, `@ao/core/plan`, `@ao/core/checkpoint`)
      במקום ייבוא ה-barrel המלא: ה-barrel המלא של `@ao/providers` גורר `@napi-rs/keyring` (תלות נייטיב)
      ושל `@ao/core` גורר `node:crypto`/`node:fs` (דרך `parse/`/`artifacts/`) — אף אחד מהם לא בטוח לבאנדל
      דפדפן. אומת ישירות ש-`plan/`/`checkpoint/` נקיים לגמרי מ-`node:*` (grep), ושה-build המלא של
      `apps/web` (כולל Vite) עדיין עובר נקי אחרי ההוספה. `DEFAULT_GOAL_CONFIG` (גם הוא ב-`plan/types.ts`,
      לא ב-`shared`, כי `shared` לא יכול לתלות ב-`@ao/core` — נבנה מתוך `BUDGET_LEVEL_TOKENS.standard`/
      `BUDGET_LEVEL_MAX_PARALLEL.standard` הקיימים, לא ממציא מספרים) הוא ברירת המחדל גם ב-web (מצב UI
      התחלתי) וגם ב-runtime (thread חדש). **שמירה לשיחה אמיתית, לא מדומה:** מיגרציה `0002_thread_goal_config`
      מוסיפה `goal_config_json` ל-`threads`; `threads.repo.ts` קורא/כותב אותו עם נפילה בטוחה ל-
      `DEFAULT_GOAL_CONFIG` על JSON פגום (לא זורק); `PUT /api/threads/:id/goal-config` (עם `GoalConfigSchema.safeParse`)
      חדש. **אומת אמפירית ב-Playwright אמיתי** (לא רק unit tests): שינוי רמה/תקציב מותאם/checkbox → טעינה
      מחדש של הדף → אותם ערכים בדיוק חוזרים — כולל תקציב מותאם `777000` וה-$ הנגזר ממנו (`$1.05`, מחושב
      נכון). **"כל שדה משפיע בפועל" — פירוט כן/לא, לא הצהרה גורפת:** `run-chat.ts` (P2's שלד-הליכה) שוכתב
      להשתמש ב-`Ledger`/`admit` **אמיתיים** (P4) במקום קבוע `NOMINAL_BUDGET_TOKENS` — `budgetTotal`/`level`
      קובעים את `run.started`, `effort` מוזרם כ-`thinkingLevel` אמיתי ל-`provider.generate` (אומת: הבקשה
      שנתפסה ב-mock נושאת `thinkingLevel:"high"`), ו-`overrunPolicy` נאכף באמת: `degrade` שנכשל ב-`admit()`
      נופל ל-`ledger.drawFromReserve` (דרגה 8, תמיד מצליחה); `ask`/`hard-stop` זורקים `BudgetExceededError`
      **לפני** כל קריאה לספק (אומת: `provider.calls.generate.length === 0`) — אין עדיין UI לשאלה
      אמצע-ריצה (זה P9-T9/T11), אז שניהם מתנהגים אותו דבר כרגע, בכוונה ומתועד. **לעומת זאת** `maxParallel`/
      `allowScripts`/`allowFolderWrite`/`requirePlanApproval` **נשמרים ונטענים נכון אך אין להם עדיין השפעה
      נצפית** — אין scheduler/tool-runner/folder-writer מחווט ל-runtime (זה עדיין הפער התשתיתי הגדול
      שה-handoff לשלב הזה ציין; P9-T1 לא היה אמור לסגור אותו, רק לוודא שההגדרות מוכנות לרגע שהוא ייסגר).
      **באג שנתפס תוך כדי:** `packages/core/src/ledger/types.ts` כבר הכיל `EXCEED_POLICIES`/`ExceedPolicy`
      זהה-בערכו אך **בלתי-תלוי** (`["degrade","ask","hard-stop"] as const`, לא בשימוש בשום מקום מלבד
      ההגדרה שלו עצמה — `runDegradationLadder`'s `policy` השתמש ב-union מוקלד-יד נפרד) — אוחד: `ExceedPolicy`
      הוא כעת alias ל-`OverrunPolicy` (`@ao/shared`), `EXCEED_POLICIES` נגזר מ-`OverrunPolicySchema.options`,
      ו-`runDegradationLadder` עודכן להשתמש בטיפוס המאוחד. 467 בדיקות `@ao/core` הקיימות ממשיכות לעבור
      ללא שינוי. גם `driver.test.ts`'s בדיקת אידמפוטנטיות של מיגרציות תוקנה (הייתה עם `toHaveLength(1)`
      קשיח שהיה נשבר בכל מיגרציה חדשה — הוחלף ב-`MIGRATIONS.length`). 7 בדיקות חדשות ב-`run-chat.test.ts`
      (כולל תרחישי hard-stop/ask/degrade עם תקציב זעיר אמיתי), בדיקות ל-`threads.repo`/`server.test.ts`
      (round-trip PUT+GET, דחיית קונפיג פגום, 404), ו-14 בדיקות רכיב ל-`GoalForm`/`GoalButton`.
      ⚠️ `packages/tools`'s `docker-sandbox.test.ts` נכשלת בסביבה הזו (container טרי בלי `dockerd` רץ,
      כפי שה-handoff הזהיר במפורש) — לא נגעתי ב-`packages/tools` בכלל, כשל סביבתי קיים-מראש ולא רגרסיה.
- [x] **P9-T2 · כרטיס תוכנית** — [`UX.md` §4](UX.md#4-כרטיס-התוכנית), כולל עדכון חי בתיקון + דיף.
      *גמור:* `plan.amended` מעדכן במקום · הבאנר מסביר מה השתנה ולמה.
      *כפי שמומש:* `apps/web/src/lib/run-state.ts` — reducer טהור (`applyRuntimeEvent(state, event) => state`)
      שמקפל את זרם אירועי ה-WS (PROTOCOLS.md §9) ל-`RunState`; משותף בכוונה בין T2 ל-T3/T4/T5/T6
      העתידיים (כבר מחווט ב-`ChatView` דרך `useReducer`) כדי שלא יהיה event-handling כפול בכל רכיב.
      **נקודת המפתח:** `plan.amended` נושא `patch` (JSON Patch גולמי), **לא** תוכנית מלאה חדשה — אז "הכרטיס
      מתעדכן במקום" ממומש ע"י הרצת `applyJsonPatch` (מ-`@ao/core/checkpoint`, אותה תת-נתיב-ייצוא מ-P9-T1)
      על התוכנית הנוכחית, ואז `PlanSchema.safeParse` על התוצאה כרשת ביטחון — פאץ' שלא חל (או תוכנית שלא
      הייתה קיימת מלכתחילה) משאיר את התוכנית הקודמת כמו שהיא, לעולם לא קורס ולעולם לא "מאבד" את הכרטיס.
      3 בדיקות ב-`run-state.test.ts` מכסות בדיוק את זה, כולל שימוש **אמיתי** ב-`formatPlanDiff` (P6-T4,
      לא מומש מחדש) לבניית טקסט הדיף של האירוע — כך שהפיקסצ'ר לא ניתן להבחנה ממה שקוד שרת אמיתי (כשייבנה)
      היה מפרסם. `PlanCard.tsx` מרנדר את הכרטיס (מכווץ/מורחב, רשימת שלבים עם `🤖 agentType ×count · fanout ·
      tokens`, באנר תיקון עם דיף לחיץ, וכפתורי ✏️ ערוך/✅ הרץ **רק כש-`requiresApproval`** — התאמה מפורשת
      ל-UX.md §4's "עריכה (כשהאישור המוקדם דלוק)"). מוצג בזרם הצ'אט דרך `MessageList` (prop חדש, אופציונלי).
      **באג RTL אמיתי שנתפס ותוקן ב-Playwright, לא רק בקוד:** הניסיון הראשון עטף כל שורת שלב (למשל
      "🤖 reader ×6 · shard לפי module · 3 במקביל · 228K" — מילים אנגליות מתחלפות עם עברית) ב-`<bdi>` *אחד*
      סביב השורה השלמה; ב-Chromium אמיתי זה נראה נכון בקוד אבל נרנדר מעורבב (`"3 במקביל · 228K"` הפך ל-
      `"3 228 במקבילK"`), כי `dir=auto` על `bdi` בוחר כיוון בסיס לפי התו החזק הראשון (English "reader") וכל
      שאר הריצות בתוכו — כולל LTR מאוחר יותר בשורה — מסתדרות-מחדש ביחס לזה. **התיקון: `<bdi>` נפרד לכל
      טוקן LTR אטומי בלבד** (agentType, מספרים, `shardKey`, תוצאת `formatTokenCount`), ומילות החיבור
      העבריות ("לפי"/"במקביל") נשארות טקסט רגיל בזרימת ה-RTL הסובבת — הועתק לתיעוד קוד ב-`PlanCard.tsx`
      כדי שהמלכודת הזו לא תיפול שוב ב-T4/T5. שורת הסיכום ("4 שלבים · 14 סוכנים · צפי 1.6M / 2.5M") **נשארה**
      עם `bdi` אחד סביב הצירוף — נבדקה חזותית ומתנהגת נכון (מספרים בתוך פרוזה עברית לא סובלים מאותה בעיה
      כמו החלפת-מילים-שלמות). אומת ב-Playwright אמיתי (Chromium, harness זמני שנמחק לפני commit): מצב ברירת
      מחדל, החלפת ×8→×4 בתיקון עם עדכון live של ספירת הסוכנים (18→14), פתיחה/סגירה של הדיף, וכיווץ/הרחבה —
      כל זה עם ה-4 השלבים והמספרים המדויקים מ-UX.md §4's מוקאפ (228K/484K/330K/106K). 7+7=14 בדיקות רכיב
      חדשות (`run-state.test.ts` + `PlanCard.test.tsx`).
      **פרשנות מתועדת:** ה-shardKey ("shard לפי X") מוצג בעקביות בכל שלב shard עם shardKey, לא רק בשלב
      אחד כמו במוקאפ (שנקרא כקיצור-דרך להמחשה, לא כלל-per-stage מדויק) — יותר מידע, בעקביות, עדיף על
      שכפול חוסר-העקביות של המוקאפ עצמו.
- [x] **P9-T3 · עריכת תוכנית** — שינוי סוכנים, מקביליות, דרגת קריאה, הסרת שלבים אופציונליים.
      *גמור:* הצפי מתעדכן מיידית · **חריגה מהתקציב חסומה ב-UI**.
      *כפי שמומש:* **האכיפה האמיתית, לא חיקוי:** `apps/web/src/lib/plan-validation.ts`'s `validateEditedPlan`
      קורא ל-`validatePlan` **האמיתי** של `packages/core/src/plan/validate.ts` (התת-נתיב `@ao/core/plan`
      מ-P9-T1) — לא מימוש-כפול של כללי V1-V8 ב-UI. `knownAgentTypes` (V3) נגזר מהסוכנים שכבר בתוכנית עצמה
      (אין עדיין רישום סוכנים אמיתי — P10 לא קיים), ו-`modelMaxOutputTokens` (V4) מגיע מ-`MODEL_REGISTRY`
      האמיתי (`@ao/providers/models`, לא מספר בדוי). **זה נבדק אמפירית שזה עובד באמת** ולא רק "עובר טסטים
      שכתבתי בעצמי": הרצת Chromium מצאה שהתוכנית שהכנתי כ-fixture להדגמה נכשלה מיידית ב-V7 האמיתי
      ("deliverable markdown needs a writer/synthesizer stage") כי שכחתי סוכן writer — זו הוכחה שהאימות
      אינו מקושט, הוא תפס בעיה אמיתית שלא תכננתי.
      `apps/web/src/lib/plan-edit.ts` — פונקציות טהורות: `scaleStageCount` (שינוי מספר סוכנים משנה גם את
      `tokenBudget.estimatedIn/estimatedOut/hardCap` **באופן יחסי** — קירוב צד-לקוח ל"הצפי מתעדכן מיידית",
      מתועד כקירוב כי אין planner אמיתי שיחשב הערכה מדויקת מחדש; `hardCap` נכלל בקנה-המידה כדי ש-V2 יתפוס
      חריגה אמיתית, לא תישאר "תקרה" ישנה שמסתירה את הבעיה), `setStageMaxParallel`, `removeOptionalStage`
      (מסרב לשלב לא-אופציונלי; מנקה הפניות מ-`dependsOn` של שלבים אחרים; **לא** מנחש אם `inputs` של שלב אחר
      תלוי בפועל בפלט שהוסר — V5 האמיתי תופס את זה בעצמו, במקום ניחוש UI מקביל), `setMaxRung`.
      `PlanEditor.tsx` (חדש) — טופס העריכה: `<select>` לדרגת קריאה (אפשרויות מעל התקרה של רמת התקציב
      מנוטרלות, לפי `BUDGET_LEVEL_MAX_RUNG`), שדה מספר-סוכנים ומקביליות לכל שלב (`NumericField`, **חולץ**
      מ-`GoalForm.tsx` ל-`components/ui/numeric-field.tsx` כדי שלא יהיה שכפול — משותף כעת בין P9-T1 ל-T3),
      כפתור "הסר שלב" רק לשלבים עם `optional:true`, ורשימת שגיאות אימות חיה. כפתור "שמור" **מנוטרל** כש-
      `!validation.valid` — לא רק מוצג-כמושבת אלא גם הבדיקה עצמה (`onSave` לא נקרא אם מנוטרל, נבדק ישירות).
      `PlanCard.tsx` שולב: "✏️ ערוך" נכנס למצב עריכה מקומי (מציג `PlanEditor` **במקום** רשימת השלבים
      הקריאה-בלבד); "שמור" מחזיר לתצוגה הרגילה עם התוכנית המעודכנת ומפעיל `onPlanEdited` (ל-caller);
      "✅ הרץ" מפעיל `onRun(plan)` עם התוכנית הנוכחית (כולל עריכות מקומיות אם יש). **פער מתועד במפורש:**
      תוכנית שנערכה נשארת **מקומית לדפדפן בלבד** — אין עדיין scheduler שיריץ אותה (אותו פער תשתיתי
      שתועד ב-P9-T1), אז `onPlanEdited`/`onRun` הם callbacks ש-caller עתידי (T7+ או שילוב runtime אמיתי)
      יחליט מה לעשות איתם; ה-UI וה-validation עצמם **כן** אמיתיים ומלאים.
      אומת ב-Chromium אמיתי: שינוי מספר סוכנים מעדכן את הצפי מיידית (138K מדויק אחרי חצי-הקטנה), הגדלה
      קיצונית חוסמת שמירה עם הודעת V2 האמיתית ("sum of stage hardCaps... exceeds budget.total..."), תיקון
      חזרה מפעיל שוב את השמירה, הסרת שלב אופציונלי מעדכנת את הכרטיס והצפי, ו-`onRun`/`onPlanEdited` מקבלים
      את התוכנית הערוכה בפועל (לא את המקורית). 11+8=19 בדיקות רכיב/יחידה חדשות
      (`plan-edit.test.ts`, `plan-validation.test.ts`, `PlanEditor.test.tsx`) + עדכון `PlanCard.test.tsx`.
- [ ] **P9-T4 · לוח תזמור** — שלוש הרמות מ-[`UX.md` §5](UX.md#5-לוח-התזמור).
      *גמור:* 20 סוכנים מקבילים ללא גמגום · ניווט מקלדת מלא.
- [ ] **P9-T5 · קופסה שקופה** — הקשר מפורק, פלט זורם, שימוש, העתקה/הרצה חוזרת/ייצוא.
      *גמור:* אפשר לענות "למה הסוכן הזה החזיר את זה" רק מהמסך הזה.
- [ ] **P9-T6 · מד תקציב** — [`UX.md` §1](UX.md#1-פריסה) + [`BUDGET.md` §8](BUDGET.md#8-תצוגה-למשתמש): צפי סיום, כתום ב-75%, אדום ב-90%.
      *גמור:* ההידרדרויות מופיעות כטוסטים לא-חוסמים.
- [ ] **P9-T7 · פאנל egress** — [`UX.md` §7](UX.md#7-פאנל-מה-יצא-מהמחשב).
      *גמור:* המספרים מדויקים · הסודות שהוחלפו מוצגים.
- [ ] **P9-T8 · כרטיסי קלט** — טוקנים משוערים ודרגת קריאה מתוכננת **לפני שליחה**.
      *גמור:* המשתמש רואה עלות לכל קובץ מראש.
- [ ] **P9-T9 · מצבי קצה** — כל המצבים מ-[`UX.md` §10](UX.md#10-מצבים-שחייבים-טיפול-מפורש).
      *גמור:* לכל מצב מסך מעוצב עם צעד הבא · אין חלונית שגיאה גנרית באפליקציה.
- [ ] **P9-T10 · נגישות ו-RTL** — [`UX.md` §9](UX.md#9-עברית-rtl-ונגישות).
      *גמור:* axe נקי · מסך שלם במקלדת בלבד · קורא מסך עובר ריצה מלאה.
- [ ] **P9-T11 · שליטה בריצה** — עצירה (חצי־עצירה עם סינתזה), ביטול, הרצה חוזרת משלב.
      *גמור:* עצירה מחזירה תוצר חלקי, לא כלום.
- [ ] **P9-T12 · היסטוריה** — רשימת שיחות, חיפוש, ייצוא ריצה, מחיקה.
      *גמור:* ייצוא JSON כולל הכל **חוץ מהמפתח**.

> **🏁 הדגמת M3:** משתמש חדש, בלי הדרכה, מחבר תיקייה, בוחר "עומק", ומקבל פרויקט רב-קבצי — כשהוא מבין בכל רגע מה קורה ולמה.

---

<a name="p10"></a>
## P10 · מתכונים ורישום סוכנים `M`

**מטרה:** לשפר את המערכת בלי לגעת בליבה.

- [ ] **P10-T1 · טעינת סוכנים מקבצים** — `agents/<type>/` לפי [`PROTOCOLS.md` §10](PROTOCOLS.md#10-רישום-סוכן).
      *גמור:* **הוספת סוג סוכן = הוספת תיקייה. אפס שינויי קוד.**
- [ ] **P10-T2 · טעינה חמה** — שינוי בפרומפט נכנס לתוקף בלי הפעלה מחדש.
      *גמור:* עריכת `agent.md` משפיעה על הריצה הבאה.
- [ ] **P10-T3 · 11 הסוכנים** — כתיבה וכיוונון של כל הסוגים מ-[`ARCHITECTURE.md` §4](ARCHITECTURE.md#4-סוגי-סוכנים).
      *גמור:* לכל סוכן בדיקת חוזה שמאמתת התאמה לסכמה.
- [ ] **P10-T4 · מתכונים** — תבניות תוכנית ב-YAML, נבחרות ע"י ה-planner.
      *גמור:* מתכון תואם חוסך את **רוב** עלות התכנון.
- [ ] **P10-T5 · ספריית מתכונים** — ניתוח מאגר · סקירת קוד · מסמך ממקורות · מיגרציה · חילוץ נתונים.
      *גמור:* 5 מתכונים עובדים מקצה לקצה.
- [ ] **P10-T6 · reducers כתוספים** — רישום ניתן להרחבה.
      *גמור:* reducer מותאם נרשם ורץ בלי לגעת בליבה.
- [ ] **P10-T7 · תיעוד הרחבה** — `docs/EXTENDING.md`: סוכן, מתכון, reducer, כלי.
      *גמור:* מפתח חיצוני מוסיף סוכן לפי המדריך בלבד.

> **הגדרת גמור לשלב:** הוספת סוג סוכן חדש ומתכון חדש — בלי לשנות שורת קוד ב-`packages/core`.

---

<a name="p11"></a>
## P11 · Evals והקשחה `L`

**מטרה:** להפוך "נראה שזה עובד" ל"נמדד שזה עובד".

- [ ] **P11-T1 · מסגרת evals** — `evals/` עם fixtures, תקציב ואסרציות.
      *גמור:* `pnpm eval` מריץ הכל ומדפיס טבלה.
- [ ] **P11-T2 · משימות זהב** — לפחות 12: קטנות/גדולות, קוד/מסמכים, ניתוח/יצירה, עברית/אנגלית.
      *גמור:* מכסות את שני הסולמות (קלט גדול, פלט גדול).
- [ ] **P11-T3 · מדדים** — טוקנים, זמן, פגיעות מטמון, הפרות סכמה, עמידה בקריטריונים, הידרדרויות, המשכות.
      *גמור:* נשמרים לאורך זמן · נסיגה מזוהה אוטומטית.
- [ ] **P11-T4 · שופט איכות** — ציון LLM מול rubric, **בתקציב קבוע ומופרד**.
      *גמור:* עקבי בין הרצות · לא נספר בתקציב המשימה.
- [ ] **P11-T5 · נסיגות עלות** — סף שנכשל כשמשימה מתייקרת מעל X%.
      *גמור:* תת-קבוצה זולה רצה ב-CI.
- [ ] **P11-T6 · סקירת אבטחה** 🪟 — כל [`ARCHITECTURE.md` §11](ARCHITECTURE.md#11-אבטחה-ופרטיות)
      + חדירה לארגז החול **בשלוש הפלטפורמות בנפרד**. סעיף ייעודי: **מה בפועל לא מבודד ב-Windows מקורי**,
      והאם ההצהרה ב-UI מדויקת.
      *גמור:* דוח כתוב · כל ממצא סגור או מתועד כמודע · **פער בידוד ב-Windows מתועד במפורש ומוצג למשתמש**.
- [ ] **P11-T7 · עומס** — 100MB קלט · 20 סוכנים מקבילים · 500 ארטיפקטים.
      *גמור:* אין דליפת זיכרון · ה-UI נשאר רספונסיבי.
- [ ] **P11-T8 · חוסן** — הזרקת כשלים: ניתוקים, 429, JSON פגום, קטיעות, קריסות תהליך.
      *גמור:* **כל תרחיש מסתיים בתוצר או בשגיאה ברורה. אף פעם בתקיעה.**
- [ ] **P11-T9 · בדיקת `ContextBroker`** ⚠️ — property-based: **לעולם אין חריגה מ-`contextBudget`**.
      *גמור:* 10K מקרים אקראיים · אפס חריגות.
- [ ] **P11-T10 · דיוק תקציב** — סטיית הסימולטור מהפועל.
      *גמור:* מתחת ל-25% על משימות הזהב אחרי כיול · נמדד ומדווח.

> **הגדרת גמור לשלב:** `pnpm eval` מדפיס טבלת איכות/עלות/זמן לכל משימות הזהב, וה-CI חוסם נסיגות.

---

<a name="p12"></a>
## P12 · אריזה ו-DX `M`

**מטרה:** שמישהו אחר יוכל להתקין, להריץ ולתרום.

- [ ] **P12-T1 · הפעלה בפקודה אחת** 🪟 — `npx agents-orchestrator` מרים הכל ופותח דפדפן.
      התאימות עצמה כבר מאומתת ב-CI מ-[P0-T5](#p0) — **כאן מלטשים את החוויה, לא מגלים בעיות**:
      פתיחת דפדפן ב-Windows · בחירת פורט פנוי · הרצה מ-PowerShell ומ-CMD · נתיב עם רווחים
      (`C:\Users\Some Name\...`) · הרצה מכונן שאינו `C:`.
      *גמור:* **smoke test ב-CI על `windows-latest` מרים את השרת ומקבל תשובה מ-endpoint אמיתי** ·
      עובד על מכונה נקייה בשלוש הפלטפורמות.
- [ ] **P12-T2 · בדיקת סביבה** 🪟 — Node/Python/Docker, עם הודעות מדויקות מה חסר ואיך מתקינים
      **לכל פלטפורמה בנפרד** (ב-Windows: קישור ל-Python מ-python.org ולא הצעת `apt`).
      *גמור:* חוסר Python **לא** מפיל את האפליקציה — רק משבית את הסקריפטים, עם הסבר ·
      ב-Windows ללא Docker מוצגת רמת הבידוד בפועל ([P7-T1](#p7)).
- [ ] **P12-T3 · תיעוד משתמש** — התקנה, מדריך ראשון, מדריך תקציב, פתרון תקלות.
      *גמור:* משתמש חדש מסיים משימה אמיתית בלי לשאול.
- [ ] **P12-T4 · תיעוד מפתחים** — `CONTRIBUTING.md`, מפת הקוד, איך מוסיפים רכיב.
      *גמור:* מפנה ל-[`EXTENDING.md`](#p10) ולמסמכים כאן.
- [ ] **P12-T5 · מצב Lite בדפדפן** *(אופציונלי)* — העלאת קבצים בלבד, בלי תיקייה ובלי סקריפטים
      ([ADR-001](DECISIONS.md#adr-001)).
      *גמור:* מוצג מפורשות מה לא זמין במצב הזה.
- [ ] **P12-T6 · אריזת דסקטופ** *(אופציונלי)* — Tauri ([Q8](DECISIONS.md#q8--אריזה-כאפליקציית-דסקטופ)).
      *גמור:* מתקין ל-3 הפלטפורמות.
- [ ] **P12-T7 · טלמטריה** — **מצטרפים מרצון בלבד**, מקומית, ללא תוכן.
      *גמור:* כבויה כברירת מחדל · מה שנאסף מתועד במלואו.
- [ ] **P12-T8 · שחרור** — גרסאות סמנטיות, changelog, פרסום.
      *גמור:* v1.0.0 מתויג ומשוחרר.

> **הגדרת גמור לשלב:** מפתח שלא ראה את הפרויקט מתקין, מריץ ומסיים משימה — תוך פחות מ-10 דקות,
> **על Windows בדיוק כמו על לינוקס**.

---

## מה בכוונה **לא** בתוכנית

| נדחה | למה | ראה |
|---|---|---|
| ריבוי ספקי LLM | הממשק קיים, המימוש מיותר בלי משתמש שני | [ADR-009](DECISIONS.md#adr-009) |
| Embeddings | BM25 + מבנה מספיקים עד שה-evals יוכיחו אחרת | [ADR-007](DECISIONS.md#adr-007) |
| ריבוי משתמשים / ענן | מוצר אחר | [A3](DECISIONS.md#חלק-ב--הנחות-עבודה) |
| סוכן שממזג פלטים | לא דטרמיניסטי, יקר, מאבד מידע | [ADR-002](DECISIONS.md#adr-002) |
| עורך פרומפטים גרפי | הסוכנים הם `.md` — נערכים בעורך | [`UX.md` §11](UX.md#11-מה-מוותרים-עליו-בגרסה-1) |
| מובייל נייטיב | רספונסיבי מספיק לגרסה 1 | [`UX.md` §11](UX.md#11-מה-מוותרים-עליו-בגרסה-1) |

---

## הצעד הבא

1. קרא את [`ARCHITECTURE.md`](ARCHITECTURE.md) ואת [`PROTOCOLS.md`](PROTOCOLS.md) — הם מגדירים את מה שבונים.
2. עבור על [שאלות פתוחות](DECISIONS.md#חלק-ג--שאלות-פתוחות-) — **אף אחת לא חוסמת**, לכולן יש ברירת מחדל.
3. התחל ב-**[P0-T1](#p0)**.
