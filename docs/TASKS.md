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
- [x] **P9-T4 · לוח תזמור** — שלוש הרמות מ-[`UX.md` §5](UX.md#5-לוח-התזמור).
      *גמור:* 20 סוכנים מקבילים ללא גמגום · ניווט מקלדת מלא.
      *כפי שמומש:* **רק רמות 1+2** ממומשות כאן (עץ שלבים/משימות `role="tree"`) — רמה 3 (הקופסה
      השקופה) היא מגירה נפרדת שנפתחת דרך `onSelectTask` (prop קיים ומחווט, עדיין לא מטופל ע"י אף
      caller — זה בדיוק מה ש-P9-T5 בונה). `apps/web/src/lib/run-state.ts` הורחב (`StageState`,
      `TaskState`, `tasksByStage`, `currentStageId`) כדי לתמוך בלוח: **`task.started` לא נושא `stageId`**
      (PROTOCOLS.md §9) — `currentStageId` עוקב אחרי זה, לא ניחוש: P5-T4's scheduler מריץ שלבים ברצף
      קפדני (לעולם לא שני שלבים חופפים), אז "השלב שהתחיל אחרון ועוד לא הסתיים" הוא חד-משמעי. גם
      סטטוס שלב/משימה **נגזר** מהשדות הקיימים ולא ממציא שדה חדש בפרוטוקול: `criteriaMet` מול
      `successCriteria` המוצהר של השלב בתוכנית (`done`/`issue`/`skipped`), `finishReason`+`violations`
      למשימה. `OrchestrationBoard.tsx` (חדש) — עץ נגיש מלא: `role="tree"`/`"treeitem"`, `aria-expanded`/
      `aria-level`, roving-tabindex עם ניווט מקלדת מלא (`↑`/`↓`/`Home`/`End`/`→` פותח או יורד/`←` סוגר
      או עולה להורה/`Enter`+`Space` מפעילים). הרחבה ראשונית (`useState` עצל): השלב הרץ, ואם אין (טעינה
      לתוך ריצה שכבר הסתיימה/reconnect) — השלב האחרון שהיה פעיל בסדר התוכנית; **זה תיקן באג אמיתי**
      שנתפס באמצע העבודה — `useEffect` תגובתי-בלבד לא הרחיב שלב שכבר *היה* גמור ברגע ה-mount הראשון.
      **ביצועים ל"20 מקבילים ללא גמגום" — לא הנחה, מומש ונבדק:** `run-state.ts`'s `withEntry` מחליף
      רשומה *אחת* ב-`Record` ומשאיר את כל השאר עם אותו object reference; `StageRow`/`TaskRow` שניהם
      `React.memo(React.forwardRef(...))`; `doneCountByStage` מחושב **פעם אחת** בהורה (לא בכל שורה).
      בדיקה ייעודית ב-`run-state.test.ts` מוכיחה יציבות reference בין 20 משימות מקביליות כש-`task.delta`
      אחד מגיע. `ChatView.tsx` שולב: הלוח מוצג כ-`<aside>` צד לצד לזרם ההודעות, **רק כש-`runState.plan`
      קיים** (UX.md §1: "בלי ... ריצה פעילה — הלוח מוסתר לגמרי") — לא תמיד-מורכב. כפתור קיפול/הרחבה
      ידני (`נפתח/נסגר` מ-UX.md §1) מכווץ את הפאנל לרצועה דקה (`w-10`, לא משאיר שטח ריק גדול), עם
      `aria-expanded`+`aria-label` תקינים. מיקום הלוח בפריסה מבוסס **אך ורק על מאפייני CSS לוגיים**
      (`border-s`, סדר DOM בתוך `flex` רגיל) — **לא** ענף JS לפי כיוון; אומת אמפירית: RTL מציב את הלוח
      בצד ימין (תואם את מוקאפ UX.md §1) והיפוך ל-`dir="ltr"` מראה שהלוח עובר לצד שמאל **אוטומטית**,
      בלי שינוי קוד.
      **באג אמיתי וחמור שנתפס ותוקן תוך כדי אימות ב-Playwright, לא קשור ללוח עצמו:** האפליקציה **כולה**
      קרסה (מסך ריק) בכל דפדפן אמיתי — `run-state.ts` (P9-T2) מייבא `applyJsonPatch` מ-`@ao/core/checkpoint`,
      וה-barrel המלא של `checkpoint/index.ts` גורר (`export * from "./agent.js"`) את `continuation/` ←
      `parse/ndjson.ts` ← `node:crypto`; Vite מנטרל `node:crypto` בבאנדל דפדפן וזורק ברגע שהבינדינג
      נקרא — **בזמן טעינת המודול, לא רק בזמן קריאה בפועל**. זה היה קיים מאז P9-T2 ולא נתפס כי אף harness
      קודם לא הרכיב את `ChatView` המלאה בדפדפן אמיתי (T4 הוא הראשון). **התיקון:** `packages/core/src/
      checkpoint/browser.ts` חדש — גזרה טהורה-דפדפן (`json-pointer`+`json-patch-apply`+`diff` בלבד, בדיוק
      מה ש-`run-state.ts` צריך), ו-`packages/core/package.json`'s `./checkpoint` export מצביע אליה במקום
      ל-`checkpoint/index.ts` המלא. הכניסה הראשית `@ao/core` (בשימוש שרת ב-runtime) **לא** נגעה בה —
      עדיין ה-barrel המלא. `apps/runtime`/שאר `packages/core` לא מייבאים דרך תת-הנתיב הזה בכלל (רק
      `apps/web` עושה זאת), אז אין סיכון לשבור שימוש קיים. אומת: האפליקציה האמיתית (`/index.html`,
      לא רק ה-harness) עולה נקי אחרי התיקון (`document.getElementById("root")` מתמלא, אין `pageerror`).
      אומת ב-Chromium אמיתי (לא רק unit tests) עם harness זמני שהרכיב את `ChatView` **האמיתית** עצמה
      (לא עותק) דרך mock ל-`window.fetch`/`window.WebSocket` ברמת הדפדפן: 20 משימות מקבילות בשלב אחד +
      שלב סינתזה בודד אחריו, כולל `task.delta` באמצע (זרם לא מפריע לשורות אחרות), סטטוסים מעורבים
      (✅/⚠️/⏳), ניווט מקלדת מלא, קיפול/הרחבת הפאנל, וסיום ריצה (`run.finished`) — הכל עם RTL עברי
      תקין (טוקנים אטומיים ב-`<bdi>` נפרדים, כמו התיקון מ-T2, ללא הישנות). נתפסה גם באג-fixture משלי
      (לא קוד המוצר): `fanout.mode:"single"` עדיין דורש `count`/`maxParallel` בסכמה (`FanoutSchema`
      אינה union לפי מצב) — תוקן ב-harness, לא ב-`PlanCard`/`plan-edit.ts` שהיו נכונים מלכתחילה.
      harness.html/harness.tsx נמחקו לפני commit, כרגיל. 12 בדיקות רכיב חדשות (`OrchestrationBoard.test.tsx`)
      + 11 בדיקות reducer חדשות (`run-state.test.ts`, 18 סה"כ בקובץ). ריצה מלאה של המונו-רפו אחרי הכל
      (typecheck+lint+test בכל 9 החבילות): 1154/1155 עוברות — הכשל היחיד הוא `docker-sandbox.test.ts`
      הידוע-מראש (סביבה בלי `dockerd`), לא רגרסיה.
- [x] **P9-T5 · קופסה שקופה** — הקשר מפורק, פלט זורם, שימוש, העתקה/הרצה חוזרת/ייצוא.
      *גמור:* אפשר לענות "למה הסוכן הזה החזיר את זה" רק מהמסך הזה.
      *כפי שמומש:* `TaskDrawer.tsx` (חדש) — נפתח בלחיצה או ב-`Enter`/`Space` על שורת משימה בלוח
      (`onSelectTask` שכבר היה קיים כ-prop ב-P9-T4, כאן סוף-סוף מטופל). ארבעת חלקי UX.md §5 רמה 3:
      **הקשר** — `contextTokens` האמיתי של המשימה (`task.started`) **בתוספת** נתוני החוזה האמיתיים
      של השלב מהתוכנית (`contextBudget.maxInputTokens`, `cacheContract`, `outputContract`, `inputs`)
      — **לא** פירוק מדומה לרכיבים (Contract/פלח/ראיות/ממצאים) עם ספירת טוקנים לכל אחד כמו שהמוקאפ
      מתאר, כי **הנתון הזה פשוט לא קיים בפרוטוקול**: `task.started` נושא סה"כ טוקנים בודד, לא פירוק —
      זה נבדק ישירות ב-`packages/shared/src/schemas/events.ts` לפני שהוחלט מה אפשר להציג באמת. **פלט**
      — `task.deltas` **האמיתי** שכבר הצטבר ב-`run-state.ts` (מ-P9-T4, שכבר תיעד "רמה 3 קוראת את זה")
      מוצג לפי סוג מעטפה (9 הסוגים: note/finding/need/section/file_begin/file_chunk/file_end/tool_result/
      done), **זורם בזמן אמת** בפועל — לא רק "בתיאוריה": אומת ב-Playwright ש-`task.delta` שמגיע **בזמן
      שהמגירה כבר פתוחה** מופיע בה מיד, בלי לסגור ולפתוח מחדש. **שימוש** — `usage`/`finishReason`/
      `violations`/זמן אמיתיים מ-`TaskState`; הזמן מתעדכן כל שנייה (`setInterval`) כל עוד המשימה עדיין
      רצה, כדי שלא יקפא ברגע פתיחת המגירה. **פעולות** — שלושה כפתורים אמיתיים, לא מקושטים: "ייצוא JSON"
      עובד באמת (מוריד את ה-`TaskState` המלא כ-JSON דרך `downloadBlob` **הקיים** מ-P8-T8, לא מומש מחדש —
      אומת שדפדפן אמיתי מוריד קובץ `task-<id>.json` אמיתי); "הרצה חוזרת" מפעיל `onRerun?.(taskId)` — אותו
      דפוס תיעוד-פער כמו `onRun`/`onPlanEdited` של P9-T3 (`ChatView` עדיין לא מעביר `onRerun` כי אין
      scheduler אמיתי שיריץ מחדש — הכפתור **מנוטרל אוטומטית** כש-`onRerun` לא הועבר, לא רק "לא עושה
      כלום" בשקט); "העתקת הפרומפט" **מנוטרל במפורש** עם `title`/`aria-label` שמסביר למה — אין טקסט
      פרומפט על הפרוטוקול בכלל (התוכן שהוזן בפועל לסוכן נבנה מצד השרת מתוכן קבצים/ארטיפקטים שהדפדפן
      אף פעם לא רואה), אז זה פער מבני אמיתי, לא עצלנות — תועד ולא זויף. `ui/dialog.tsx`'s `DrawerContent`
      (חדש) — משתמש **באותו** Radix Root שכבר קיים ל-Dialog הממורכז של P9-T1 (focus trap, `Escape`, portal
      — לא מומש מחדש), אבל מוצב כמגירת צד-מלאה-בגובה בקצה הפריסה (לא ממורכז) כדי שהלוח יישאר גלוי
      (מוכהה) מאחורי ה-overlay, תואם ל"מגירה" של UX.md ולא ל-modal חוסם.
      **באג אמיתי שנתפס בבדיקה ידנית של צילום מסך, לא ע"י בדיקה אוטומטית:** הרינדור הראשוני של המעטפות
      (evidence/chunk/chars/lines/ok/failed/truncated/criteria) כלל מחרוזות אנגליות מוקשות ישירות בקוד
      במקום לעבור דרך i18n — סטייה מהמוסכמה העקבית בכל הפרויקט (כל טקסט למשתמש עובר `t()`). תוקן:
      מפתחות `board.drawer.envelope.*` חדשים בשתי השפות, כולל אינטרפולציה נכונה. **תוך כדי התיקון
      אומת מחדש** שהחלטת T2 בעניין `<bdi>` עדיין תקפה ומיושמת נכון: שדה `finding.claim` החופשי (פרוזה
      מלאה שכוללת מילים אנגליות באמצע, כמו "יש תלות מעגלית בין auth ל-billing") **נשאר בכוונה בלי bdi**
      ומוצג נכון ע"י אלגוריתם ה-bidi הרגיל של הדפדפן (זה בדיוק המקרה ש-UBA נועד לו); לעומת זאת השורה
      המורכבת "תגיות · מס' ראיות · ביטחון" (רשימה מופרדת-נקודות כמו שורת הסיכום של PlanCard מ-T2) קיבלה
      `<bdi>` נפרד לכל שדה אטומי — אותה הבחנה בדיוק כמו T2, לא ניחוש חדש.
      אומת ב-Chromium אמיתי (לא רק unit tests): פתיחת מגירה בלחיצה **ו**במקלדת (`Enter` על שורה
      ממוקדת) על שתי משימות שונות (מציג נתונים שונים ונכונים לכל אחת — לא נתקע על הראשונה), הקשר/פלט/
      שימוש עם נתונים אמיתיים מלאים, זרימת `task.delta` חיה לתוך מגירה פתוחה, טיימר חי, הורדת קובץ
      JSON אמיתית (נתפס דרך אירוע `download` של Playwright, לא רק שה-click לא זרק שגיאה), סגירה ב-
      `Escape` עם הלוח נשאר שלם מתחת, ו-RTL תקין לאורך כל המגירה. 11 בדיקות רכיב חדשות
      (`TaskDrawer.test.tsx`). ריצה מלאה של המונו-רפו: 1165/1166 עוברות — אותו כשל `docker-sandbox.test.ts`
      הידוע-מראש, לא רגרסיה.
- [x] **P9-T6 · מד תקציב** — [`UX.md` §1](UX.md#1-פריסה) + [`BUDGET.md` §8](BUDGET.md#8-תצוגה-למשתמש): צפי סיום, כתום ב-75%, אדום ב-90%.
      *גמור:* ההידרדרויות מופיעות כטוסטים לא-חוסמים.
      *כפי שמומש:* `BudgetMeter.tsx` (חדש) מחליף לגמרי את `TokenCounter.tsx` (הוסר, כולל הבדיקה שלו
      והמפתחות `header.tokensUsed`/`_zero` היתומים) — ה"placeholder" מ-P2-T8 שתיעד בעצמו "No budget
      ceiling or progress bar yet — that's P4" סיים את תפקידו: עכשיו יש גם תקציב אמיתי לכל ריצה (P9-T1)
      וגם חשבונאות `Ledger` חיה על החוט. **`ledger.updated`** (קיים בסכימה מאז P1/P4 אבל **אף פעם לא
      נצרך** ע"י אף מסך עד עכשיו) עכשיו מוזן ל-`run-state.ts` (`spent`/`committed`/`remaining`/`byStage`,
      מתאפס יחד עם כל שאר ה-state ב-`run.started`, כמו כל שדה אחר). **הצ'יפ בכותרת** (💰 נוצל/סה"כ + פס
      התקדמות) פועל תמיד מרגע שנטענה שיחה (`0/budgetTotal` לפני כל ריצה — לא ממתין לריצה ראשונה, ולא
      מציג מספר בדוי). **הצבע** (`budgetSeverity`, `lib/budget-projection.ts`) נמדד לפי `(spent+committed)/
      total` **ולא** `spent` בלבד — אומת ב-Playwright: 500K נוצל + 450K משוריין מתוך 1M מציג **אדום**
      למרות ש"נוצל" לבדו הוא רק 50%, כי טוקנים משוריינים כבר לא זמינים לשאר הריצה בדיוק כמו טוקנים
      שהוצאו (אותה חשבונאות בדיוק כמו `admit()`'s "available = total - spent - committed"). **דיאלוג
      פרטים** (לחיצה על הצ'יפ, אותו Radix Dialog root כמו `GoalButton` מ-P9-T1 — לא מומש מחדש): שרוף/
      מוקצה/נותר/צפי + פירוט לפי שלב (`byStage` האמיתי מה-ledger — למסלול הצ'אט האמיתי של היום זה
      `{chat: N}` בודד כי אין scheduler רב-שלבי, מתועד ולא מוסתר) + הערת כתום/אדום עם **מדיניות החריגה
      האמיתית** (`goal.overrun.*`, מפתחות **קיימים** מ-T1, לא כפולים).
      **צפי סיום מבוסס-קצב (`projectFinalTokens`):** "קצב" כאן הוא **יחס כיול actual/estimated** של
      השלבים שהסתיימו (רעיון `CalibrationStore` מ-P4, מיושם בצד-הלקוח על נתוני החוט) ולא קצב שעון —
      טוקנים נגזרים ממבנה התוכנית (fan-out, גודל שלב) הרבה יותר מזמן שחלף. מיושם באמת (לא ניחוש): יחס
      `spent/estimatedSoFar` על השלבים שהסתיימו מוכפל ב-`sumPlanEstimatedTokens` **הקיים** (מ-`plan-edit.ts`,
      P9-T3, לא מומש מחדש). **מחזיר `null` (לא מוצג, לא מומצא) כשאין תוכנית טעונה** — וזה **המצב האמיתי
      של הבאקאנד היום**: `run-chat.ts` (המסלול היחיד שרץ בפועל) **אף פעם לא** משדר `plan.ready` (נבדק
      ישירות בקוד) כי אין עדיין scheduler רב-שלבי — אז הצפי פשוט לא מופיע עד שקיים ריצה אמיתית עם
      תוכנית, בדיוק כמו הפער המתועד ב-T1/T3/T4. אומת קצה-לקצה ב-Chromium: יחס כיול 2.5× (500K בפועל
      מול 200K צפי לשלב שהסתיים) על תוכנית עם צפי כולל 400K → צפי סופי **1M בדיוק**, תואם לחישוב היד.
      **אירוע חוט חדש, `budget.degraded`** (נוסף ל-`packages/shared/src/schemas/events.ts` + טבלת
      PROTOCOLS.md §9 + `events.test.ts`) — **הכרחי, לא תוספת שרירותית**: גמור-הבר של המשימה דורש טוסטים
      אמיתיים, ולא היה **שום** אות קיים על החוט ל"הידרדרות קרתה" (בניגוד ל-`checkpoint.decision`, ששייך
      למושג אחר — צ'קפוינטים אדפטיביים של P6). נורה ב-`run-chat.ts` בדיוק במקום ה-`ledger.drawFromReserve`
      היחיד הקיים, עם הערכים האמיתיים שהוא כבר מחזיר (`amount`, `clamped`) — לא מספרים בדויים. בדיקה
      חדשה ב-`run-chat.test.ts` אימתה זאת **ותפסה טעות בציפייה שלי עצמי**: הנחתי `clamped:false` לתרחיש
      הקיים, אבל הריצה בפועל החזירה `clamped:true` (תקציב כה זעיר שאפילו הרזרבה עצמה לא הספיקה למלוא
      ה-worst-case) — תוקנה הבדיקה, לא הקוד, כי הקוד היה נכון. **טוסטים לא-חוסמים באמת, לא רק בשם:**
      `DegradationToasts.tsx` — מיכל `pointer-events-none` שרק כל טוסט בודד בתוכו הוא `pointer-events-auto`,
      **בלי** overlay ובלי focus-trap (בניגוד ל-`Dialog`/`Drawer`) — אומת ב-Playwright: לחיצה על צ'יפ
      התקציב **הצליחה** בזמן ששני טוסטים מוצגים על המסך. נעלמים לבד אחרי 6 שניות (טיימר עצמאי לכל טוסט,
      `useEffect` בקומפוננטת `Toast` פנימית) **וגם** ניתנים לסגירה ידנית — שניהם נבדקו (`vi.useFakeTimers`
      + `userEvent`).
      אומת ב-Chromium אמיתי (לא רק unit tests): מצב אפס (0/1M) מיד עם טעינת שיחה, מעברי צבע אמיתיים ב-75%
      וב-90% (כולל דרך `committed`), הדיאלוג עם כל השדות, טוסט הידרדרות רגיל ומ-`clamped`, אי-חסימה
      מוכחת, וצפי סיום מדויק לאחר שלב אמיתי שהסתיים — כל זה RTL תקין (בדיקה חוזרת שהחלטת T2's ה-`<bdi>`
      עדיין מיושמת נכון בקומפוננטות החדשות). 30 בדיקות חדשות: `budget-projection.test.ts` (10),
      `BudgetMeter.test.tsx` (10), `DegradationToasts.test.tsx` (7), 3 חדשות ב-`run-state.test.ts`
      (סה"כ 21 בקובץ). ריצה מלאה של המונו-רפו: 1194/1195 עוברות — אותו כשל `docker-sandbox.test.ts`
      הידוע-מראש, לא רגרסיה.
- [x] **P9-T7 · פאנל egress** — [`UX.md` §7](UX.md#7-פאנל-מה-יצא-מהמחשב).
      *גמור:* המספרים מדויקים · הסודות שהוחלפו מוצגים.
      *כפי שמומש:* **חקירה לפני קוד, לא ניחוש:** `egress.recorded` היה קיים בסכימה מאז P1/P4 אבל
      **אף פעם לא נורה** ע"י אף קוד runtime אמיתי (נבדק ישירות — grep על כל `apps/runtime/src`). `EgressLedger`
      (P3-T10, `packages/ingest`) הוא מודול אמיתי ומתועד-בעצמו כ"data source for the ... egress.recorded
      runtime event" אבל **לא מחווט ל-`apps/runtime`** — לא נעשה בו שימוש כאן, כי הוא נועד לצבור על-פני
      קבצים/ארטיפקטים ש**עדיין לא קיימים** בנתיב הצ'אט האמיתי (P3's `connectFolder`/`ingestFiles` אינם
      מחוברים ל-`apps/web` בכלל — אין UI לחיבור תיקייה). `redactPayload`/`GeminiProvider.getEgressRedactions()`
      (P1-T9), לעומת זאת, **כן** רצים על כל קריאת Gemini אמיתית היום — פשוט אף אחד לא קרא את התוצאה.
      **תיקון ארכיטקטורה קטן, לא סתם תוספת:** `getEgressRedactions()` לא היה חלק מהחוזה המשותף `LLMProvider`
      (רק שיטה ספציפית ל-`GeminiProvider`), אז `run-chat.ts` (שמוקלד מול `LLMProvider`, לא `GeminiProvider`)
      לא היה יכול לקרוא לה בכלל בלי לשבור את ה-abstraction. הוסף `getEgressRedactions()` ל-`LLMProvider`
      ב-`@ao/shared` (עם `RedactionEvent` שהועבר לשם מ-`@ao/providers` כדי ש-`@ao/shared` לא יתלה חזרה
      ב-`@ao/providers`, אותה סיבה בדיוק ש-`LLMProvider` עצמו כבר יושב ב-`@ao/shared`) — ה-typecheck
      **תפס בעצמו** כל מקום שהיה צריך עדכון: `MockLLMProvider` (מחזיר `[]` תמיד — לא שולח כלום לשום מקום
      אמיתי), `DelayedProvider` הפנימי ב-`reconnect.test.ts`, ואובייקט מוקלד-מבנית ב-`continuation.test.ts`
      — שלושה מקומות, כולם תוקנו, אף אחד לא נשכח כי הקומפיילר לא הרשה.
      **`bytes`/`redactions` אמיתיים, לא בדויים:** `bytes` נמדד מהמטען היוצא בפועל (`TextEncoder` על
      ה-`GenerateRequest` שנשלח ל-`provider.generate`, אותה גישה "אמיתי אך מקורב" כמו `contextTokens`
      הקיים). `redactions` — **פער חישוב אמיתי שנתפס בזמן העבודה, לא רק בבדיקה**: `getEgressRedactions()`
      מצטבר על פני **כל חיי ה-process** (הספק נבנה **פעם אחת** ב-startup, `select-provider.ts`, ומשותף
      לכל הריצות) — דיווח הערך הגולמי היה מציג את **כל** ההידרדרויות מאז הפעלת השרת בכל קריאה, לא רק
      את של הקריאה הזו. תוקן ע"י snapshot לפני/אחרי ה-`generate()` ודיווח ה-**דלתא** בלבד — נבדק ישירות
      ב-`run-chat.test.ts` עם ספק-בדיקה ייעודי שכבר "מגיע" עם 2 הידרדרויות קודמות ומוסיף עוד 1 בקריאה
      הנוכחית: הדיווח הוא `1`, לא `3`.
      `run-state.ts` — `egress.recorded` **מצטבר בהוספה** (בניגוד ל-`ledger.updated` שמחליף snapshot
      שלם בכל פעם), כי כל קריאה היא רשומה נפרדת; מתאפס יחד עם כל שאר ה-state ב-`run.started`.
      `EgressPanel.tsx` (חדש) — צ'יפ קומפקטי ("🔒 יצא: 3.5KB") + Dialog עם פירוט מלא (סה"כ/מס' קריאות/
      התראת הידרדרות אדומה/רשימת קריאות עם בייטים+הידרדרויות לכל אחת), משתמש ב-`formatBytes` **הקיים**
      (P8, `artifact-kind.ts`) — לא מומש מחדש. **לא** מציג את שורת "🚫 לא נשלח: X קבצים" של המוקאפ ולא
      פירוק לפי-קובץ/דרגת-קריאה — שניהם דורשים קורפוס מחובר (תיקייה) שפשוט לא קיים, ולא זויף.
      **החלטה ארכיטקטונית מרכזית:** תנאי הנראות של הסיידבר (`ChatView.tsx`) הורחב מ-"רק כש-`plan` קיים"
      (T4) ל-"`plan` **או** פעילות egress קיימת" — **כי** נתיב הצ'אט האמיתי **אף פעם לא** משדר `plan.ready`
      (כמו שתועד כבר ב-T6), אז לוּ הפאנל היה מקונן רק בתוך הבלוק המותנה-plan, הוא היה **לעולם לא נראה
      בשימוש אמיתי** — פיצ'ר אמיתי אבל בלתי-נגיש. אומת ישירות ב-Playwright: הודעת צ'אט אמיתית → `egress.recorded`
      אמיתי מגיע → הסיידבר **מופיע** עם הפאנל בלבד (בלי `plan.ready` שאף פעם לא נשלח) — זו ההוכחה
      שהפיצ'ר בפועל visible, לא רק "עובד בקוד". גם אומת שכש-`plan` **כן** מגיע לאותה ריצה, שני האזורים
      (לוח + egress) מתקיימים יחד באותו סיידבר.
      **תפיסת נגישות תוך כדי כתיבת בדיקה, לא רק תוך כדי קוד:** תג ה-🔴 החזותי על הצ'יפ הוא `aria-hidden`
      (עיטורי) — כתיבת בדיקה ל"קורא מסך מקבל את מספר ההידרדרויות" חשפה שה-`aria-label` **לא** כלל את זה
      בכלל, רק את בייטים/מס' קריאות. תוקן: `aria-label` דינמי שמוסיף את משפט ההידרדרות (מפתח `egress.
      redactionCount` הקיים) כשיש הידרדרות — לא רק ויזואלי.
      אומת ב-Chromium אמיתי (לא רק unit tests): רצף הודעות עם `egress.recorded` מצטבר חי, תג הידרדרות
      מופיע/נעלם נכון, Dialog עם פירוט מלא, ו-RTL תקין לכל אורך (כולל בדיקה חוזרת שהחלטת T2's `<bdi>`
      עדיין מיושמת נכון: "יצא: 2.3 KB" היא פרוזה חד-פעמית ולא רשימה מופרדת-נקודות, אז bdi יחיד סביבה
      נכון בכוונה — לא כמו שורת התגיות/ראיות ב-T5 שדרשה bdi נפרד לכל שדה). 13 בדיקות חדשות: `EgressPanel.
      test.tsx` (9), 2 חדשות ב-`run-state.test.ts`, 2 חדשות ב-`run-chat.test.ts` (9 בקובץ). ריצה מלאה של
      המונו-רפו: 1207/1208 עוברות — אותו כשל `docker-sandbox.test.ts` הידוע-מראש, לא רגרסיה.
- [x] **P9-T8 · כרטיסי קלט** — טוקנים משוערים ודרגת קריאה מתוכננת **לפני שליחה**.
      *גמור:* המשתמש רואה עלות לכל קובץ מראש.
      *כפי שמומש:* **חקירה לפני קוד:** אין שום פונקציית שיוך-דרגת-קריאה-לקובץ בכל הקוד-בייס (נבדק
      ישירות) — `ReadRung` מופיע רק ברמת **תוכנית/שלב** (`readPolicy.maxRung`, כבר בשימוש ב-T3), לא
      כתכונה אינטרינזית של קובץ בודד. זו **החלטת planner** אמיתית (רלוונטיות-למשימה, R0-R5) שדורשת
      ריצת planner אמיתית מול בקשה אמיתית — ואין עדיין. לכן **אין תג דרגת-קריאה** בכרטיס, בניגוד למוקאפ —
      תג קבוע/מומצא היה מייצג החלטה שאף דבר לא קיבל בפועל. גמור-הבר של המשימה עצמה מדבר על **עלות**, לא
      על התג הזה במפורש — מומש במלואו.
      **הערכת טוקנים אמיתית, לא ניחוש:** `estimateTokens` (P3-T9, מכויל אמפירית מול הטוקנייזר האופליין
      של Gemini, סטייה <15%) נחשף כתת-נתיב חדש `@ao/ingest/tokens` (הקובץ עצמו טהור לגמרי — אפס imports —
      אומת גם ב-`tsc` וגם ב-build אמיתי של Vite שאין דליפת Node builtin, אותה שיטה בדיוק כמו P9-T1/T4).
      `classifyArtifactViewer`/`formatBytes` (P8) משמשים לאייקון/גודל — לא מומשים מחדש. קבצי טקסט/קוד/
      Markdown/טבלה מוערכים באמת (כולל הבחנה אמיתית בין יחס "code" ל"mixed" — אומת בבדיקה שאותו טקסט
      עם סיומת `.ts` מול `.txt` נותן הערכות **שונות**); תמונות/ZIP מוצגים כ"לא זמין" — לא בדוי.
      **לא רק UI — התוכן מגיע בפועל להודעה שנשלחת, לא נזרק בשקט:** בניגוד לרוב הפערים המתועדים ב-P9
      (scheduler/planner חסרים) — כאן **אין** צורך בתשתית חדשה כדי לחבר קצה-לקצה: `composeMessageWithAttachments`
      מרכיב טקסט הודעה + תוכן קובץ אמיתי (לקבצי טקסט) לפני השליחה, ב-`ChatInput.tsx` בלבד — **אפס** שינוי
      סכמה/route/DB. אומת ב-Playwright: הגוף שנשלח בפועל ל-`POST /api/threads/:id/messages` מכיל את
      **תוכן הקובץ האמיתי**, לא רק תצוגה מקדימה שנעלמת. קובץ בינארי/גדול-מדי לא נזרק בשקט — הודעה מפורשת
      "התוכן לא נשלח" מחליפה את התוכן במקום.
      **באג סביבה אמיתי שנתפס בהרצה, לא בקוד:** `File.prototype.text()` **לא קיים** ב-jsdom 25.x (סביבת
      הבדיקות) — נתפס כי הבדיקות נכשלו בפועל, לא ניחוש. תוקן במעבר ל-`FileReader.readAsText` (נתמך בכל
      דפדפן אמיתי **וגם** בסביבת הבדיקות) — לא עקיפה מקומית לבדיקות, תיקון אמיתי בקוד המוצר.
      **תפיסת קצה נוספת:** קריאת קובץ שנכשלת (`FileReader.onerror`) לא הייתה אמורה לדחות את ה-Promise
      של `buildAttachmentState` — `Promise.all` על כמה קבצים יחד היה **מפיל את כל האצווה** על כשל קובץ
      בודד. תוקן: סטטוס `read-error` ייעודי, `try/catch` פנימי שלעולם לא דוחה.
      אומת ב-Chromium אמיתי: צירוף דרך בורר קבצים **וגם** גרירה-ושחרור, כרטיס אמיתי לכל קובץ (טקסט/
      תמונה/גדול-מדי), הסרת כרטיס, שליחה עם קבצים בלבד (בלי טקסט מוקלד) מופעלת, וניקוי מלא של הרכיב
      וה-textarea אחרי שליחה — RTL תקין לכל אורך. 24 בדיקות חדשות: `attachments.test.ts` (12),
      `AttachmentCard.test.tsx` (6), 6 חדשות ב-`ChatInput.test.tsx` (11 בקובץ). ריצה מלאה של המונו-רפו:
      1231/1232 עוברות — אותו כשל `docker-sandbox.test.ts` הידוע-מראש, לא רגרסיה.
- [x] **P9-T9 · מצבי קצה** — כל המצבים מ-[`UX.md` §10](UX.md#10-מצבים-שחייבים-טיפול-מפורש).
      *גמור:* לכל מצב מסך מעוצב עם צעד הבא · אין חלונית שגיאה גנרית באפליקציה.
      *כפי שמומש:* **חקירה לפני קוד, לכל אחת מ-12 השורות בטבלת UX.md §10 בנפרד:** נבדק ישירות בקוד (לא
      הונח) אילו שורות יש להן יכולת backend אמיתית לחבר, ואילו תלויות בתשתית שלא קיימת עדיין (scheduler
      רב-שלבי, צינור ingestion מחובר, סוכן כותב-קבצים) — אותה משמעת בדיוק כמו T1-T8. שש שורות מומשו/חוברו
      באמת, שש מתועדות כפער כן-ואמיתי (לא הבל).
      **1. אין מפתח API — `OnboardingScreen.tsx` (חדש):** מסך מעוצב אמיתי במקום ההתנהגות הקודמת (פתיחת
      Settings בכפייה בלי הסבר, בלי דרך להמשיך בלי מפתח). משתמש במפתחות `onboarding.*` שהיו קיימים מ-P2-T7
      **בלי שום קומפוננטה שרינדרה אותם** (נבדק ישירות — grep על כל העץ). קישור אמיתי ל-Google AI Studio
      (`https://aistudio.google.com/app/apikey`) **אומת ב-WebSearch**, לא ניחוש מהזיכרון — אותו קישור
      נוסף גם ל-`ApiKeyForm.tsx` שלא היה לו קישור בכלל קודם. `App.tsx` שוכתב: `hasKey`/`onboardingDismissed`
      + `refreshKeyStatus()` שרץ גם ב-mount וגם כשה-Settings dialog נסגר (כך שהוספת מפתח וסגירת ההגדרות
      **מבטלת** את הקליטה אוטומטית) — נכשל-פתוח (`hasKey: true`) אם ה-runtime לא זמין, כמו ההתנהגות
      הקודמת.
      **2. מפתח לא תקין/פג + 3. מגבלת קצב (429):** `ChatView`'s state `error` הורחב מ-`string` למבנה מלא
      (`scope`/`code`/`message`/`recoverable`, מתאים גם ל-payload האמיתי של אירוע ה-WS `error` וגם ל-
      `ApiError.serialized` מ-`lib/api.ts`). **תגלית מהחקירה:** `ERROR_MESSAGES` (`packages/shared`) כבר
      מכיל טקסט עברי נכון ומקומי-מראש לכל קוד שגיאה — `message` שמגיע על ה-wire **כבר** התוכן הנכון, לא
      היה צריך תיקון. מה שחסר זו **פעולה**, לא טקסט: כל שגיאה עם `scope === "provider"` מקבלת כפתור אמיתי
      "מעבר להגדרות" (`onOpenSettings` הוזרם מ-`App.tsx` דרך `ChatView` — חוט חדש). **נבדק ולא מומש בכוונה:**
      ניסיון "משתמש/2/4 + טיימר" חי — `GeminiProvider.generate()` עוטף את עצמו ב-`withRetry` (נבדק ישירות
      בקוד), אז עד שהשגיאה מגיעה ל-client כל הניסיונות **כבר מוצו** — אין "ניסיון חי" לשדר. גם נבדק (ולא
      מומש): מיפוי 400/`API_KEY_INVALID` לקוד ייעודי ב-`toProviderError` — **אומת ב-WebSearch** שמפתח לא
      תקין ב-Gemini חוזר כ-400 עם `reason: API_KEY_INVALID` בגוף ה-JSON, לא 401/403; ה-SDK החיצוני
      (`@google/genai`) חושף רק `status`+`message` גולמיים על ה-`ApiError` שלו, לא את ה-`reason` המקונן —
      מיפוי לפי טקסט ההודעה היה ניחוש שביר על API חיצוני שיכול להשתנות, ולא נבנה. מפתח שנפסל **בזמן שמירה**
      (Settings) כבר מטופל נכון וקיים מ-P2-T7 (`ProviderKeyError` אמיתי, `POST /api/keys` קורא ל-
      `validateApiKey` **לפני** אחסון) — לא נגעתי, כבר עבד.
      **6. תקציב אזל:** `scope === "budget"` מקבל טקסט-עזר סטטי שמפנה לכפתור המטרה (לא כפתור "המשך" מזויף)
      — **כי** בנתיב הצ'אט הנוכחי אין "מה נעשה" להציג: `run-chat.ts` דוחה את הקבלה **לפני** כל קריאת ספק
      (`admit()` נכשל → שגיאה מיידית, אין `task.started` בכלל בענף הזה) עבור `overrunPolicy` מסוג
      `"ask"`/`"hard-stop"` — תואם את ההערה הקיימת בקוד עצמו: *"there's no mid-turn 'ask' UI yet (that's
      P9-T9/T11's job)"*. UI אמיתי ל"אשר לפני חריגה" דורש זרימת אישור-לפני-שליחה שלמה (המסר מוחזק לפני
      POST) — זה **P9-T11** (שליטה בריצה), לא הרחבת-יתר כאן.
      **5. קובץ ריק/פגום:** נבדק (לא תוקן — היה כבר נכון) שקובץ ריק-בייטים עובר `estimateTokens("")` → `0`
      נקי, לא `NaN`/קריסה, ושכישלון `FileReader` אמיתי (לא רק `status` שגוי) fails-safe ל-`read-error` בלי
      להפיל אצווה — **שני מסלולים שהיו נכונים מ-T8 בלי שום בדיקת רגרסיה עליהם**; נוספו עכשיו (`attachments.
      test.ts`, כולל polyfill זמני ל-`FileReader.prototype.readAsText` כדי לדמות כשל אמיתי).
      **11. ניתוק WebSocket — כבר אמיתי, לא נבנה מחדש:** אימות ישיר בקוד (`lib/ws.ts`) מראה reconnect +
      השלמת-פערים לפי `seq` מהיומן העמיד כבר **קיימים ועובדים** (מ-P2-T6) — הריצה אכן לא נעצרת. התוספת
      היחידה: באנר-רגע "החיבור התחדש" (מפתח `chat.connectionRestored`, קיים-אך-יתום מאז ומעולם לא נקרא —
      נבדק ב-grep) שנעלם לבד אחרי 3 שניות, מזוהה דרך מעבר `wsStatus` מ-`"reconnecting"` ל-`"open"`.
      **פערים אמיתיים, מתועדים בכוונה ולא מומשו (כל אחד נבדק בקוד, לא הונח):**
      · **4. קליטה איטית** — אין שום חיווט בין `packages/ingest` ל-`apps/web`; אין path של "העלאת קובץ
      לשרת" בכלל בנתיב הצ'אט הנוכחי (T8's כרטיסי קלט קוראים קבצים **בדפדפן בלבד**).
      · **8. קריסת runtime "המשכתי משלב 2"** — היומן העמיד לפי `seq` (11, למעלה) פותר את הבעיה המכנית של
      חידוש-אחרי-קריסה, אבל "שלב 2" מרמז על ריצה **רב-שלבית** שאין עדיין בנתיב הצ'אט האמיתי (שלב יחיד
      תמיד) — אין מה "להמשיך ממנו" בפועל.
      · **9. 🪟 בידוד חלקי ב-Windows** — נבדק ישירות: **אין שום** איתות/דגל isolation-mode בכל
      `packages/tools/src` (ADR-013 מתאר עיצוב, לא מומש) — אין ממה לצייר את הבאנר.
      · **10. 🪟 שם קובץ פסול ב-Windows** — דורש סוכן שכותב ארטיפקטים בזמן ריצה אמיתית; נתיב הצ'אט הנוכחי
      לא מייצר ארטיפקטים בכלל (P8's viewers מציגים קבצים קיימים, לא כותבים חדשים).
      · **12. תוצר חלקי (`gaps`)** — נבדק ישירות: `run-chat.ts` שולח `gaps: []` **קשיח** בכל שלושת
      הפרסומים של `run.finished` שלו (אין מסלול אחר בזמן-אמת). `Gap`/`assembleRunOutcome` אמיתיים קיימים
      עמוק ב-`packages/core` (assembler/reducers) אבל **לא מחוברים** לנתיב הריצה האמיתי — סעיף "מה חסר
      ולמה" היה מציג מצב שהאפליקציה האמיתית לא יכולה לייצר היום; לא נבנה UI מת.
      **7. הידרדרות** — כבר גמור לגמרי ב-T6 (Toast לא-חוסם), שום עבודה נוספת.
      **תפיסת סביבת-בדיקות אמיתית:** `jsdom` **לא מממש** `Element.prototype.scrollIntoView` בכלל (תלוי
      ב-layout שאין ל-jsdom) — `MessageList.tsx` קורא לו בכל רינדור; שום בדיקה לא רינדרה את `MessageList`
      לפני עכשיו אז הפער לא נתפס. תוקן ב-`test/setup.ts` (polyfill גלובלי ל-**כל** הבדיקות, לא רק לחדשות).
      **אימות ב-Chromium אמיתי (לא רק unit tests), עם runtime אמיתי:** הורצו שרת runtime אמיתי (data dir
      נקי-לגמרי, בלי מפתח, `MockLLMProvider` אמיתי) + שרת Vite אמיתי דרך harness זמני (`harness.html`/
      `harness-main.tsx`, **נמחקו לפני commit** כמו תמיד) — ה-`WebSocket` הגלובלי הוחלף בפייק נשלט (רק
      השכבה הזו מזויפת; HTTP/DB/React/state-logic **אמיתיים לגמרי**). אומת קצה-לקצה: onboarding אמיתי
      מ-DB ריק → פתיחה/סגירה של הגדרות → "המשך בלי מפתח" → שגיאת provider עם ניווט אמיתי להגדרות → שגיאת
      budget עם טקסט-עזר → ניתוק אמיתי (השהיה אמיתית של 1000ms, לא מדומה) → "מתחבר מחדש" → "החיבור התחדש"
      → נעלם לבד אחרי 3000ms → קובץ ריק אמיתי בדפדפן אמיתי מציג "0 B · ~0 טוקנים". תקלה אחת בדרך הייתה
      **בסקריפט הבדיקה עצמו**, לא באפליקציה: `lastSeq === -1` ב-`RunEventSocket` אומר "חיבור ראשון אף
      פעם לא קיבל אירוע" → מדווח `"connecting"` ולא `"reconnecting"` — ניתוק *לפני* אירוע ראשון (כמו
      שהסקריפט ניסה בהתחלה) מפיק בצדק שום באנר; תוקן בסקריפט לשדר `run.started` לפני הניתוק, בדיוק כמו
      ריצה אמיתית.
      16 בדיקות חדשות: `App.test.tsx` (7), `OnboardingScreen.test.tsx` (3), `ChatView.test.tsx` (4, ה-
      קומפוננטה הזו **מעולם לא** נבדקה קודם), 2 חדשות ב-`attachments.test.ts` (14 בקובץ). ריצה מלאה של
      המונו-רפו: **1248/1248 עוברות** (כולל `docker-sandbox.test.ts` — daemon הופעל ידנית לריצה הזו).
- [x] **P9-T10 · נגישות ו-RTL** — [`UX.md` §9](UX.md#9-עברית-rtl-ונגישות).
      *גמור:* axe נקי · מסך שלם במקלדת בלבד · קורא מסך עובר ריצה מלאה.
      *כפי שמומש:* **חקירה לפני קוד, שורה-שורה מטבלת UX.md §9:** ארבע שורות התבררו **כבר גמורות** לגמרי
      מפאזות קודמות (נבדק בקוד, לא הונח): **טיפוגרפיה** (`index.css`+`tailwind.config`: Assistant/Heebo
      ל-body, מונו אמיתי ל-`code`/`kbd`/`samp`, הערת UX.md §9 מפורשת כבר בקוד), **Markdown מעורב**
      (`Markdown.test.tsx` — 3 בדיקות `<bdi dir="ltr">` אמיתיות, כולל **בדיוק** מקרה-הבדיקה-החובה של
      UX.md: פסקה עברית עם מונח אנגלי), **תנועה** (`@media (prefers-reduced-motion: reduce)` גלובלי ב-
      `index.css` — `animation-duration`/`transition-duration`/`scroll-behavior` כולם ל-0.01ms, מכסה כל
      אנימציה בכל האפליקציה, לא רק חדשה), ו-`aria-live` (סטטוס-סטרימינג `role="status"` ב-`MessageBubble`
      עם טקסט קבוע "כותב תשובה..." — לא מכריז כל chunk בנפרד, נמנע מהצפה; טוסטים כבר `aria-live="polite"`
      מ-T6). **לא היה צריך לבנות מחדש אף אחת מהארבע.**
      **axe-core כתשתית אמיתית, לא בדיקה חד-פעמית:** `axe-core@4.13.0` נוסף כ-devDependency אמיתי (לא
      זמני) + `test/axe.ts` — helper משותף שרץ נגד DOM אמיתי (jsdom) בכל בדיקת קומפוננטה. `color-contrast`
      מנוטרל בכוונה ברמת קומפוננטה (jsdom אין לו canvas/layout — נכשל fail-fast, לא מדווח false-positive)
      ו-`region` (תוכן חייב landmark) מנוטרל שם גם כן **מסיבה שונה**: זו בדיקת-רמת-**עמוד**, ולא קטע —
      פרגמנט מבודד תמיד ייכשל בה בלי קשר לקומפוננטה; נבדקה **באמת** פעם אחת ברמת ה-App השלם
      (`App.test.tsx`, `<header>`+`<main>` אמיתיים) ועברה נקי. 18 בדיקות axe חדשות נוספו לכל קומפוננטה
      מ-P9 (GoalButton, PlanCard, PlanEditor, OrchestrationBoard, TaskDrawer, BudgetMeter,
      DegradationToasts, EgressPanel, AttachmentCard, ChatInput, OnboardingScreen, ChatView, App) +
      `SettingsDialog.test.tsx` חדש (5 בדיקות — היה **בלי שום** כיסוי קודם), כל אחת ברגע ה-render
      ה"עשיר" ביותר של הקומפוננטה (דיאלוג פתוח, שגיאה מוצגת, כמה קריאות ביחד).
      **שני באגי נגישות אמיתיים שנתפסו ותוקנו — לא false-positive:** (1) `TaskDrawer`'s `role="dialog"`
      **לא היה לו שם נגיש בכלל** (לא `DialogTitle`, רק `<h2>` רגיל) — קורא מסך שפותח את המגירה שומע רק
      "dialog", בלי לדעת איזו משימה. תוקן: `<DialogTitle asChild>` עוטף את ה-`<h2>` הקיים (Radix מחווט
      `aria-labelledby` אוטומטית, אפס שינוי חזותי). (2) קלט הקובץ המוסתר ב-`ChatInput.tsx`
      (`<input type="file" className="hidden">`) היה בלי `aria-label` — תוקן עם אותו מפתח `chat.attachFiles`
      שכבר בשימוש בכפתור ה-Paperclip הנראה.
      **ניגודיות צבע ב-Chromium אמיתי, שתי ערכות נושא — לא jsdom (לא יכול):** runtime+Vite אמיתיים (data
      dir נקי) + `axe.min.js` מוזרק אמיתי ל-5 מסכים אמיתיים (onboarding, הגדרות, צ'אט ריק, פופאובר מטרה,
      צ'אט עם הודעות אמיתיות) כפול שתי ערכות = 10 בדיקות ניגודיות אמיתיות. **תקלת-תזמון בסקריפט עצמו
      נתפסה ותוקנה:** axe הופעל **מיד** אחרי `classList.toggle("dark")`, ותפס צבע **אמצע-מעבר** אמיתי
      (`transition-colors` של Tailwind, ~150ms) — לא רק אצל קומפוננטה אחת, אצל כמה כפתורים שונים עם אותה
      חתימת-צבע חשודה בדיוק, מה שחשף את התבנית. תוקן ע"י המתנה של 300ms אחרי כל מעבר ערכת-נושא לפני הרצת
      axe. **אחרי התיקון נשארו שני באגים אמיתיים, לא ארטיפקט:** (1) `GoalForm.tsx`'s טקסט-העזר
      "עד R4/R5..." תחת כל רמת תקציב היה `text-neutral-400 dark:text-neutral-500` — גוון אחד בהיר/כהה מדי
      **בשתי הערכות** (2.52:1 בהיר, 3.78:1 כהה — נדרש 4.5:1), בניגוד ל-`text-neutral-500 dark:text-
      neutral-400` שכל שאר הטקסט המשני **באותו קובץ ממש** (כולל התווית ממש מעליו) כבר משתמש בו — תוקן
      להתאים. (2) פס-הגלילה של `MessageList.tsx` (`overflow-y-auto`) היה חסר `tabindex` — ברגע שההודעות
      עולות על גובה המסך, משתמש מקלדת-בלבד **לא יכול לגלול אליהן בכלל** (axe: `scrollable-region-focusable`,
      נתפס רק במצב "יש הודעות אמיתיות", לא במסך ריק) — תוקן עם `tabIndex={0}`, טכניקה סטנדרטית ל-WCAG
      2.1.1.
      **מעבר מקלדת-בלבד אמיתי:** מ-Tab ראשון בעמוד — כל עצירה ממוקדת (`document.activeElement`) נבדקה
      ל-outline **וגם** ל-box-shadow (טבעת ה-focus-visible של Tailwind) — שניהם קיימים בכל עצירה, סדר
      הגיוני (Header → תיבת כתיבה → צירוף → מטרה), Escape סוגר דיאלוגים בכל מקום (Radix, מאומת גם ביחידה
      וגם בדפדפן אמיתי). ניווט מקלדת מלא בלוח התזמור (Arrow×4, Home/End, Enter/Space) כבר קיים ומאומת
      **בפירוט מ-T4** — נבדק שוב, עדיין עובד, לא נבנה מחדש.
      **החלטה מתועדת: `Enter` נשאר שולח, לא `Ctrl+Enter`.** UX.md §9's טבלה אומרת "Ctrl+Enter שליחה",
      אבל §2 (הספק המפורט, כולל placeholder-הטקסט **בפועל** בקוד) אומר "`Enter` שולח · `Shift+Enter` שורה
      חדשה" — וזה מה שמומש ונבדק (3 בדיקות) מאז השלד ההליכתי. נשמר §2's ההתנהגות המפורטת/כבר-קיימת/כבר-
      נבדקת; §9 מטופל כניסוח לא-מדויק בטבלת-סיכום, לא כדרישה נפרדת לשינוי UX פוגעני.
      **פערים כנים, לא מומשו — נבדקו בקוד, לא הונחו:** **Ctrl+K לוח פקודות** — `grep` על כל העץ: אפס
      תשתית command-palette קיימת, ו-UX.md לא מגדיר אף פעם אילו "פקודות" בכלל אמורות להיות שם — בניית לוח
      פקודות מאפס בלי שום מפרט תהיה המצאה, לא מימוש. **`Esc` לעצירת ריצה** — תלוי בפיצ'ר עצירה שעדיין לא
      קיים (**P9-T11**); `Esc` **כן** כבר עובד לסגירת דיאלוגים/מגירות (Radix, מאומת).
      **סוויפ מחרוזות קשיחות:** grep מלא על `components/`+`App.tsx` (חוץ מבדיקות) לטקסט עברי גולמי בתוך
      JSX — **אפס תוצאות**. כל מחרוזת עברית עוברת `t()`.
      18 בדיקות axe + 5 בדיקות `SettingsDialog.test.tsx` חדשות = 23 בדיקות חדשות. ריצה מלאה של המונו-רפו:
      **1266/1266 עוברות**.
- [x] **P9-T11 · שליטה בריצה** — עצירה (חצי־עצירה עם סינתזה), ביטול, הרצה חוזרת משלב.
      *גמור:* עצירה מחזירה תוצר חלקי, לא כלום.
      *כפי שמומש:* **חקירה מקיפה לפני קוד** (subagent ייעודי): נבדקו UX.md §2/§5/§9/§10,
      DECISIONS.md, BUDGET.md, ו-`run-chat.ts`/`ledger.ts`/`llm-provider.ts`/`@google/genai`'s type defs
      בפועל. תגליות מרכזיות שקבעו את ההיקף: (1) ה-SDK של Gemini עצמו מתעד `abortSignal` כ"client-only —
      won't cancel the request in the service, still billed" בכל מקום שהוא מופיע, וקריאת ה-streaming
      הספציפית שהקוד משתמש בה (`generateContentStream`) לא חושפת בכלל פרמטר ביטול ברמה הזו. (2) `Ledger`'s
      `release()` (לעומת `settle()`) כבר **תועד מראש** כ"Resolves a failed **or canceled** call" — בדיוק
      המנגנון הנכון לעצירה-אמצע-סטרים, בלי לבנות משהו חדש. (3) `packages/core`'s `runScheduler` כבר מקבל
      `AbortSignal` אמיתי ומטופל, אבל **אף אחד ב-apps/ לא קורא לו** — אותה תבנית פער כמו T1/T3/T7/T9.
      (4) `runs.status` ב-SQLite הוא `CHECK` **קשיח** (`'running','completed','failed'`) — הוספת סטטוס
      חדש דורשת migration אמיתי, לא רק שינוי טיפוס.
      **מנגנון עצירה אמיתי, לא UI-בלבד:** `RunRegistry` חדש (`apps/runtime/src/chat/run-registry.ts`) —
      `Map<runId, AbortController>` בזיכרון, נרשם **באופן סינכרוני** בתחילת `runChatTurn` (לפני כל
      `await`) כך שבקשת עצירה לעולם לא יכולה להגיע לפני שהרשומה קיימת. `run-chat.ts`'s לולאת ה-`for await`
      בודקת `abortController.signal.aborted` **אחרי** כל delta (לא לפני) — כך שעצירה שמגיעה בדיוק כשהזרם
      מסתיים בכל מקרה נספרת כהשלמה אמיתית, לא כעצירה (הבחנה מכוונת ל-ledger). בעצירה אמיתית: `ledger.
      release()` (לא `settle` — אין `Usage` אמיתי לזרם שנקטע, בדיוק כמו כל קריאה כושלת/מבוטלת אחרת), הודעת
      עוזר עם הטקסט **שהצטבר בפועל** (או `null` אם שום טקסט לא הגיע — לא "תשובה ריקה" מזויפת), `run.finished`
      עם `status:"stopped"` חדש. Migration `0003_run_status_stopped` (נוהל recreate-copy-swap הרשמי של
      SQLite ל-CHECK constraints — אין ALTER ישיר) מאומת גם על שדרוג DB אמיתי עם נתונים קיימים (לא רק DB
      חדש) וגם שה-constraint עדיין אמיתי אחרי השדרוג. נקודת קצה חדשה `POST /api/runs/:id/stop` —
      **תמיד 204**, גם לריצה שכבר הסתיימה לבד (race שפיר, לא שגיאה).
      **לקוח: כפתור עצור אמיתי, לא טקסט מנוטרל.** UX.md §2's "שלח / עצור" — `ChatInput` מפריד עכשיו
      `disabled` (אין thread) מ-`isStreaming` (ריצה פעילה): בזמן סטרימינג מוצג כפתור **אמיתי ולחיץ**
      "עצור" (אייקון ריבוע) במקום כפתור שלח מנוטרל. `Esc` (UX.md §9) קורא ל-stop **גלובלית**, אבל
      **נכנע** לדיאלוג Radix פתוח קודם (`document.querySelector('[role="dialog"]')`) — כך ש-Esc בזמן
      שהגדרות/כפתור-מטרה פתוחים סוגר את הדיאלוג בלבד, לא גם עוצר את הריצה בטעות; מאומת ישירות מול דיאלוג
      Radix אמיתי (לא מדומה) גם ביחידה וגם בדפדפן. סעיף "הריצה נעצרה. התשובה למעלה חלקית" מוצג אחרי
      `run.finished` עם status "stopped" (לא "failed" — `run-state.ts`'s reducer תוקן להבחין ביניהם),
      נעלם עם ההודעה הבאה.
      **"ביטול" לא מומש כפעולה נפרדת:** UX.md אף פעם לא מגדיר "ביטול" כבאפר שונה מ"עצירה" (רק מופיע
      פעם אחת, בהקשר **אחר** לגמרי — ביטול קליטת קבצים, לא ריצה) — אותו מנגנון stop אחד מכסה גם "עצור
      עם טקסט חלקי" וגם "עצור בלי שום טקסט עדיין" (`assistantMessage: null`) בצורה טבעית, בלי כפתור שני.
      **"הרצה חוזרת משלב" — לא מומש, פער כן:** `TaskDrawer.onRerun`/`PlanCard.onRun` **כבר** בנויים נכון
      מ-P9-T3/T5 כפערים מתועדים (מנוטרלים אוטומטית כש-handler לא מועבר) — כי אין scheduler רב-שלבי מחובר
      ל-apps/runtime בכלל (`runChatTurn` הוא קריאה בודדת, לא ריצה עם "שלבים" לבחור מהם). שום קוד חדש לא
      נדרש — ההתנהגות הנכונה כבר קיימת.
      **באג אמיתי שנתפס ותוקן דרך אימות דפדפן אמיתי, לא ב-`.inject()`:** קליק אמיתי על "עצור" חזר 400
      (`FST_ERR_CTP_EMPTY_JSON_BODY`) — `lib/api.ts`'s `request()` שלח `content-type: application/json`
      גם לבקשות **בלי גוף** (`stopRun`, וגם `deleteKey` הקיים!). Fastify דוחה את זה כשהגוף ריק, אבל
      `server.test.ts`'s `.inject()` **לא** משכפל את הבדיקה הזו — כלומר **מחיקת מפתח API בהגדרות הייתה
      שבורה בשקט** מאז P2-T7 (ה-`catch` שלה "best-effort", לא מציג שגיאה) בלי שאף בדיקה קיימת תפסה את
      זה. תוקן ב-`request()`: `content-type` נשלח רק כשיש `body` אמיתי. נוסף `api.test.ts` חדש (5 בדיקות)
      שמוכיח את זה ישירות דרך `fetch` מדומה.
      **אימות קצה-לקצה אמיתי ב-Chromium, כולל תקלת-timing אמיתית שנפתרה:** ניסיון ראשון מול ה-
      `MockLLMProvider` הרגיל (12 chunks, בלי await בין chunks) **תמיד** הפסיד את המרוץ — הזרם השלם +
      ה-WS + השמירה ב-DB הושלמו לפני שבקשת ה-HTTP הנפרדת ל-stop הספיקה להגיע בכלל (MockLLMProvider מתוכנן
      בכוונה בלי latency מלאכותי — P1-T1). זה **לא** באג באפליקציה — Gemini אמיתי סוטר בהשהיה רשתית
      אמיתית לכל chunk, בניגוד למוק הסינכרוני. נבנה harness זמני (`harness-slow-server.mjs`, **נמחק לפני
      commit**) שמריץ בדיוק את אותה קומפוזיציה אמיתית עם 400ms await אמיתי בין chunks, כדי שקליק Stop
      אמיתי יקבל חלון-זמן אנושי-תצפיתי לנחות בו. אומת קצה-לקצה עם ה-harness הזה: תוכן חלקי אמיתי נשמר
      ("This is a" מתוך המשפט המלא), `usage: undefined` (ledger שוחרר, לא settled), הודעת "נעצרה" מוצגת,
      הקומפוזר חוזר לפעיל, Esc-to-stop עובד קצה-לקצה, ו-Escape עם דיאלוג פתוח **לא** עוצר את הריצה (כפתור
      העצור עדיין מוצג אחרי סגירת הדיאלוג).
      37 בדיקות חדשות: `RunRegistry` (5), `migrations.test.ts` חדש (3), `runs.repo.test.ts` (+1),
      `run-chat.test.ts` (+3 — עצירה-באמצע, עצירה-בלי-טקסט, stop-אחרי-שהריצה-כבר-נגמרה), `server.test.ts`
      (+3 — נקודת הקצה האמיתית), `run-state.test.ts` (+1), `ChatInput.test.tsx` (+4), `ChatView.test.tsx`
      (+6), `api.test.ts` חדש (5). ריצה מלאה של המונו-רפו: **1297/1297 עוברות**.
- [x] **P9-T12 · היסטוריה** — רשימת שיחות, חיפוש, ייצוא ריצה, מחיקה.
      *גמור:* ייצוא JSON כולל הכל **חוץ מהמפתח**.
      *כפי שמומש:* **חקירה לפני קוד:** `api.listThreads()` כבר ממוין `ORDER BY updated_at DESC` (מ-P2) —
      בדיוק הסדר שרשימת ההיסטוריה צריכה, שום שינוי backend לא נדרש בשביל זה. `UX.md` §1's מוקאפ הפריסה
      (עמודת "שיחות" · `+ חדשה` · קבוצות-תאריך מתקפלות ▸/▾) הוא היעד הקונקרטי. תגלית משמעותית: מפתחות
      i18n בשם `threads.heading`/`newChat`/`untitled`/`loading` **כבר קיימים** ב-`he.json`/`en.json` —
      נוספו בפאזה מוקדמת כצפייה מראש למסך הזה ומעולם לא נקראו בקוד (נבדק ב-grep, אפס תוצאות) — נעשה בהם
      שימוש כפי שהם, לא הומצאו מחדש.
      **"ייצוא ריצה" — החלטת-scope אמיתית, לא ניחוש:** אין שום UI/endpoint ברמת-ריצה בודדת באפליקציה
      האמיתית (אותו פער בדיוק כמו P9-T1/T3/T5/T7/T9/T11: תשתית run-scoped קיימת עמוק ב-`packages/core`
      אבל לא מחוברת ל-`apps/`) — "ייצוא" מתפרש כאן ליחידה האמיתית היחידה שקיימת: **כל השיחה** (thread
      + כל ההודעות שלה), בדיוק כמו שקריטריון ה"גמור" עצמו מרמז ("ייצוא JSON כולל **הכל**"). ממומש
      **כולו בצד לקוח**: `GET /api/threads` + `GET /api/threads/:id/messages` הקיימים כבר מספקים את כל
      הנתונים — שום endpoint חדש לא נדרש, `downloadBlob` הקיים (P8-T8) מטפל בהורדה. נבדק ישירות (יחידה
      + דפדפן אמיתי) שה-JSON המיוצא **לעולם** לא מכיל `apiKey`/מחרוזת שמתחילה ב-`AIza` — לא רק "לא
      אמור", אלא נבדק.
      **Backend:** `deleteThread` חדש ב-`threads.repo.ts` — מחיקה טרנזקציונית אחת (`BEGIN`/`COMMIT`) לפי
      סדר-תלות (`events` → `runs` → `messages` → `threads`, כי `driver.ts` רץ עם `PRAGMA foreign_keys =
      ON`), כך ששיחה נמחקת **כולה** או **בכלל לא**, לא חלקית. נקודת קצה חדשה `DELETE /api/threads/:id` —
      `404` לשיחה לא-קיימת (לא no-op שקט, בניגוד ל-`stopRun`: כאן זו טעות אמיתית של המשתמש/הלקוח, לא
      race שפיר), `204` להצלחה. 4 בדיקות חדשות ב-`threads.repo.test.ts` (כולל cascade אמיתי עם
      message+run+event אמיתיים, ואי-נגיעה בשיחה אחרת) + 3 ב-`server.test.ts`.
      **לקוח: `ThreadSidebar.tsx` חדש** — מתקפל, `+ שיחה חדשה`, חיפוש טקסט חופשי בצד-לקוח (סינון
      `Array.filter` פשוט — אין endpoint חיפוש בשרת ולא נדרש בגודל-רשימה ריאלי למשתמש יחיד), רשימה
      מקובצת-תאריך (`lib/thread-groups.ts` חדש — פונקציה טהורה, 10 בדיקות כולל גבולות חצות מדויקים
      ותאריך פגום), כל קבוצה מתקפלת בנפרד. כל שורה חושפת ב-hover/focus כפתורי ייצוא ומחיקה (`Trash`/
      `Search`/`Plus` — אייקונים חדשים ב-`icons.tsx`). מחיקה עוברת דרך `window.confirm` אמיתי (שום
      קומפוננטת אישור לא קיימת באפליקציה הזו בכלל — `deleteKey` הקיים ב-Settings גם הוא ללא אישור —
      נשמר עקבי, לא הומצא דיאלוג חדש שלא התבקש). שיחה עם הכותרת המילולית `"New chat"` (ברירת-המחדל
      הקשיחה מהשרת, לא מתורגמת) מוצגת עם `threads.untitled` **המתורגם** — הערך המאוחסן נשאר יציב
      ובלתי-תלוי-שפה, רק התצוגה מתורגמת. 17 בדיקות חדשות (`ThreadSidebar.test.tsx`), כולל axe נקי.
      **`ChatView` הפך ל-prop נשלט:** קיבל `thread: Thread | null` במקום bootstrap עצמאי (`listThreads`/
      `createThread` פנימיים) — האחריות על רשימת/בחירת השיחה עברה ל-`App.tsx`, שמחזיק אותה בשביל הסיידבר
      ממילא. מיפוי `App.tsx`: `<ChatView key={selectedThreadId ?? "pending"} thread={selectedThread} .../>`
      — מעבר בין שיחות הוא **remount אמיתי**, הדרך הנקייה והבטוחה ביותר לאפס **את כל** המצב הפנימי
      (הודעות, goalConfig, runState, socket ה-WS) בבת אחת, בלי לפספס אף state variable בטעות. ה"רינדור
      אופטימי" הקיים (P9-T9: `ChatView` מוצג מיד, לא ממתין ל-`keyStatus`) **נשמר** — `thread` יכול להיות
      `null` לחלון הקצר לפני שהשיחה הראשונה מסתיימת, וה-composer פשוט מנוטרל עד אז. 3 בדיקות חדשות
      ב-`ChatView.test.tsx` (shell עם `thread=null`, composer מופעל עם thread אמיתי, `onThreadActivity`
      נקרא ב-`run.finished`) + 6 ב-`App.test.tsx` (bootstrap, יצירה, מעבר, מחיקה כולל "מחיקת השיחה
      האחרונה יוצרת חדשה").
      **שני באגים אמיתיים, נתפסו רק דרך אימות דפדפן אמיתי — לא ביחידה, כי `render()` ב-Testing Library
      לעולם לא עוטף ב-`<StrictMode>`:** (1) `React.StrictMode`'s הפעלה-כפולה-מכוונת של effects ב-dev
      גרמה למרוץ אמיתי: `bootstrap effect`'s `listThreads()` → (ריק ⇒) `createThread()` רץ **פעמיים**
      נגד DB שעדיין ריק לפני שאף קריאה הספיקה לחזור — יצר **שתי שיחות** בטעינת-דף בודדת אחת, בשקט לגמרי
      (קיים ככל הנראה מאז ה-bootstrap המקורי של `ChatView` ב-P2, בלתי-נראה כי לא היה UI שמציג את רשימת
      השיחות עד עכשיו). תוקן עם `useRef` guard ("כבר bootstrap-תי"). (2) התיקון הראשון **בעצמו** שבר את
      עדכון ה-state: הפעלה הראשונה (המושלכת) של האפקט עדיין מריצה את ה-cleanup שלה **באופן סינכרוני**
      (סמנטיקת StrictMode), שמסמן `cancelled = true` על המשתנה ש-ה-closure של השרשרת האסינכרונית **היחידה
      שנשארה בחיים** (מוגנת ע"י ה-ref) תלויה בו — כשהיא נפתרת, `if (cancelled) return` מבטל בשקט את
      `setThreads`/`setSelectedThreadId`/`setThreadsLoading(false)`, והסיידבר נשאר תקוע על "טוען שיחות..."
      **לנצח**. תוקן בהסרת מנגנון ה-`cancelled` כליל מהאפקט הזה — React 18 כבר לא עושה כלום (בלי אזהרה)
      ל-`setState` על קומפוננטה שבאמת פורקה, כך שלא היה שום דבר אמיתי להגן עליו.
      **אימות קצה-לקצה ב-Chromium אמיתי, עם runtime אמיתי (data dir נקי-לגמרי):** תרחיש מלא — טעינה
      ראשונה → שיחה אחת אוטומטית ("שיחה חדשה" מתורגם) → שליחת הודעה → `+ שיחה חדשה` → הודעה שנייה
      מבחינה → חיפוש מצמצם → מעבר בין שיחות מציג רק את ההודעות שלה → ייצוא מוריד JSON אמיתי (נבדק:
      מכיל thread+messages, לא מכיל מפתח) → מחיקה עם אישור מוריד שורה → קיפול/הרחבה → axe נקי (light
      **וגם** dark, ניגודיות-צבע אמיתית בדפדפן אמיתי, לא jsdom) — **15/15 בדיקות עברו**. פריסת RTL
      אומתה גם ויזואלית (צילום מסך: עמודת "שיחות" מימין, בדיוק כמו מוקאפ UX.md §1) וגם דרך
      `boundingBox()` — קצה ימני של הסיידבר מתלכד עם קצה ימני של `<main>`. Harness זמני (`verify-t12.
      mjs` + סקריפטי debug), DB זמני, ותהליכי שרת — **כולם נמחקו/נעצרו לפני commit**, כרגיל.
      44 בדיקות חדשות: `threads.repo.test.ts` (+4), `server.test.ts` (+3), `api.test.ts` (+1),
      `thread-groups.test.ts` חדש (10), `ThreadSidebar.test.tsx` חדש (17), `ChatView.test.tsx` (+3),
      `App.test.tsx` (+6). ריצה מלאה של המונו-רפו: **1340/1341 עוברות** (הכישלון היחיד:
      `docker-sandbox.test.ts`'s בדיקת-daemon-חי — תלוית-סביבה, לא קשורה ל-P9-T12, אותה הערה בדיוק כמו
      ב-P9-T11).

> **🏁 הדגמת M3:** משתמש חדש, בלי הדרכה, מחבר תיקייה, בוחר "עומק", ומקבל פרויקט רב-קבצי — כשהוא מבין בכל רגע מה קורה ולמה.

---

<a name="p10"></a>
## P10 · מתכונים ורישום סוכנים `M`

**מטרה:** לשפר את המערכת בלי לגעת בליבה.

- [x] **P10-T1 · טעינת סוכנים מקבצים** — `agents/<type>/` לפי [`PROTOCOLS.md` §10](PROTOCOLS.md#10-רישום-סוכן).
      *גמור:* **הוספת סוג סוכן = הוספת תיקייה. אפס שינויי קוד.**
      *כפי שמומש:* `packages/platform/src/agent-registry/` (`loader.ts`) — `listAgentTypes`/`loadAgentDefinition`/
      `loadAgentPromptTemplate`/`loadAgent` הם סריקת-תיקייה+קריאת-קובץ טהורה: `listAgentTypes` מחזיר כל
      תת-תיקייה תחת `agentsDir` שמכילה `agent.json`, וזה כל מה שנדרש כדי ש"הוספת סוג" תהיה "הוספת תיקייה" —
      אין שום מקום בקוד שמונה סוגים בפירוש (נבדק ב-`listAgentTypes` picks up a brand-new folder). האימות מול
      `AgentDefinitionSchema` הקיים (`@ao/shared`, לא שכפול) קורה ב-`loadAgentDefinition`, כולל בדיקה ש-`type`
      בקובץ תואם את שם התיקייה. `packages/core` נשאר בלי שינוי שורה אחת — הטעינה מהדיסק יושבת ב-`@ao/platform`
      (לא `@ao/core`, ששומר על "אפס I/O" גם אחרי P10, וגם לא `apps/runtime` ישירות, כדי שתהיה שמישה גם
      מ-evals/CLI עתידיים) ומייבאת סכמות ישירות מ-`@ao/shared` בלבד — **לא** מ-`@ao/core`, כדי לא להפוך את
      התלות "platform → core" ולשבור את השכבתיות הקיימת (`core`/`platform` שתיהן תלויות רק ב-`@ao/shared`).
      נוסף `resolveOutputSchema` (`schema-registry.ts`) שפותר `outputContract.schemaRef` לסכמת Zod אמיתית —
      גילוי אמיתי מהמחקר: `schemaRef` היה עד כה מחרוזת תיעודית בלבד (בדיקות/UI, אף פעם לא נפתר בפועל); כל
      סוכן-worker מאומת בפועל מול אותה `NdjsonEnvelopeSchema` יחידה ([`PROTOCOLS.md` §3](PROTOCOLS.md#3-חוזה-פלט-סוכן--ndjson)),
      אז זו הערך היחיד שנרשם — ערך צר יותר לכל סוג ידרוש קודם תמיכת פרסר אמיתית, אחרת `{{outputSpec}}` יבטיח
      צורה שהפרסר לא אוכף בפועל (בדיוק הבאג ש-[ADR-006](DECISIONS.md#adr-006) קיים למנוע). חובר ל-composition
      root: `apps/runtime/src/agents-dir.ts`'s `resolveAgentsDir` — `AO_AGENTS_DIR` (אותה מוסכמת `AO_*` כמו
      `loadConfig`) או ברירת מחדל שמטפסת מ-`import.meta.url` של הקורא עד שמוצאת `pnpm-workspace.yaml` (שורש
      המונורפו) ומצרפת `agents/`; הליכה-למעלה ולא היסט קבוע של `..` כי `index.ts` ו-`test-support/*.ts` נמצאים
      בעומק שונה מהשורש — נבדק בפועל בשני העומקים. `AppContext` מקבל שדה `agentsDir: string` (לא registry
      טעון-מראש — ראו P10-T2). 20 בדיקות חדשות (`agent-registry`: 15, `agents-dir`: 5), כל 140 בדיקות
      `@ao/platform`+`@ao/runtime` עוברות (63+77), build+lint+format נקיים.
- [x] **P10-T2 · טעינה חמה** — שינוי בפרומפט נכנס לתוקף בלי הפעלה מחדש.
      *גמור:* עריכת `agent.md` משפיעה על הריצה הבאה.
      *כפי שמומש:* "חם" **מובנה בעיצוב**, לא מנגנון invalidation נפרד: אף פונקציה ב-`agent-registry/loader.ts`
      לא שומרת תוצאה בזיכרון בין קריאות — כל קריאה ל-`loadAgentDefinition`/`loadAgentPromptTemplate` קוראת
      מהדיסק מחדש, אז אין מה "לפסול" כשקובץ משתנה. הוחלט **לא** להשתמש ב-`fs.watch`/file-watcher: זה מנגנון
      עתיר-מצב ועתיר-תקלות חוצה-פלטפורמות (רגיש במיוחד תחת Docker/רשת, ולא אמין בעקביות ב-Windows —
      P12-T1/T2 כבר מטרידים את עצמם בדיוק בזה) — ותצפית ריקה: קריאת שני קבצים קטנים מקומיים על כל קריאת
      סוכן היא זולה (תת-מילישנייה), כך שאין סיבה אמיתית לשלם על מטמון+invalidation. `AppContext.agentsDir`
      (P10-T1) הוא מחרוזת נתיב בלבד, לא צילום-מצב טעון-מראש — אין בשום מקום ב-composition root עותק מוזחל
      של הרישום ש"לטעון חמה" צריך לעקוף. *כפי שמומש בבדיקה אמיתית:* `loader.test.ts`'s "hot reload" describe
      block — כותב `agent.md`/`agent.json`, טוען, **עורך את הקובץ בפועל על הדיסק** (`writeFileSync` בלי לגעת
      במטמון כלשהו כי אין), טוען שוב באותו תהליך (לא restart), ומוודא שהתוכן השני מוחזר. זו בדיוק ה"עריכה
      משפיעה על הריצה הבאה בלי הפעלה מחדש" — לא הנחה, אלא הרצה בפועל של השינוי בין שתי קריאות.
- [x] **P10-T3 · 11 הסוכנים** — כתיבה וכיוונון של כל הסוגים מ-[`ARCHITECTURE.md` §4](ARCHITECTURE.md#4-סוגי-סוכנים).
      *גמור:* לכל סוכן בדיקת חוזה שמאמתת התאמה לסכמה.
      *כפי שמומש:* גילוי אמיתי מהמחקר ששינה את התוכנית: מ-11 הסוגים בטבלת ARCHITECTURE.md §4, **רק 6**
      תואמים בפועל למנגנון `agents/<type>/` שנבנה ב-P10-T1 — `reader`/`analyst`/`coder`/`writer`/`critic`/
      `synthesizer`, כל הפלט שלהם NDJSON חופשי-צורה דרך `agent-runner` הגנרי. חמשת האחרים —
      `recon`/`planner`/`checkpoint`/`outliner`/`toolsmith` — **כבר ממומשים במלואם** בקוד עם prompt-builder
      מקודד-קשיח (`buildReconPrompt`/`buildPlannerPrompt`/`buildCheckpointPrompt`/`buildOutlinerPrompt`/
      `buildToolsmithPrompt`, כולם מ-P5–P8) ו-`responseSchema` של Gemini לאובייקט JSON יחיד — לא NDJSON.
      זו לא בחירת מימוש אלא אילוץ סכמה אמיתי: `OutputContractSchema` (`packages/shared/src/schemas/common.ts`)
      נועל `format` ל-`z.literal("ndjson")` בלבד, אז חמשת אלה **לא יכולים** לעבור אימות `AgentDefinitionSchema`
      מבלי לשנות את הסכמה עצמה — וזה היה משכפל/מסכן קוד עובד ובדוק במקום לעשות reuse עליו (הנחיה מפורשת).
      גם `seam-stitch.ts` (התפירה בפועל מאחורי `llm:synthesize`) התברר כמקודד-קשיח באותו אופן, מפורשות
      "worker-tier" למרות שהטבלה קושרת synthesis ל-tier `synth` — הוכחה נוספת ש-5 אלה שייכים למשפחה שונה
      לגמרי, לא רק "טרם חוברו". התיעוד הזה, לא בניית agent.json מזויף שלא מניע כלום בפועל, הוא הדרך הכנה
      להתמודד עם הפער (הנחיה #2). ל-6 הסוגים האמיתיים: `agents/<type>/agent.json`+`agent.md` מלאים —
      `contextBudget`/`tier`/`thinkingLevel`/`maxOutputTokens` לפי הטבלה (reader: 8K/worker/low,
      analyst: 12K/worker/medium — עובד **רק** מעל ממצאים, נאסר עליו לבקש artifacts גולמיים; coder:
      16K/worker/medium — בעלות בלעדית על קובץ, `file_begin`/`file_chunk`/`file_end` עם `sha256` אמיתי;
      writer: 12K/worker/medium — סעיף יחיד; critic: 4K/cheap/low — בודק בלבד, לעולם לא כותב/מתקן בעצמו;
      synthesizer: 16K/synth/high — הרכבה בלבד, אסור להמציא עובדה שלא בחומר שסופק, עקבי עם ADR-002).
      כל שישה ה-`agent.md` כתובים בעברית, משתמשים בכל 6 המשתנים מ-PROTOCOLS.md §10 ומסתיימים תמיד בהוראה
      לשורת `done` יחידה (PROTOCOLS.md §3 כלל 3). נוסף `findWorkspaceRoot` (`packages/platform/src/paths/`) —
      חילוץ מ-`apps/runtime/src/agents-dir.ts` שהיה מכיל את אותה הליכה-למעלה כפי שנכתבה ב-P10-T1, כי
      `packages/platform`'s בדיקת החוזה גם היא צריכה לאתר את `agents/` האמיתי; עכשיו קוד אחד משותף לשניהם.
      בדיקת החוזה עצמה — `apps/runtime/src/agent-contract.test.ts` (ב-composition root, לא ב-`@ao/platform`,
      כי היא באמת בודקת אינטגרציה: קובץ אמיתי → `@ao/platform`'s `loadAgent` → `@ao/core`'s `buildAgentPrompt`
      האמיתי, לא סימולציה) — לכל אחד מ-6 הסוגים: האם נטען ומאומת, האם תואם את טבלת הארכיטקטורה (תופס דריפט
      תיעוד⟷קוד), האם `schemaRef` נפתר לסכמה אמיתית, והאם `agent.md` עובר `buildAgentPrompt` האמיתי בלי
      placeholder שלא נפתר ועם `{{outputSpec}}` אמיתי בפלט — ועוד בדיקה הפוכה שמוודאת שלחמשת ה-hardcoded
      אין תיקייה תחת `agents/` (הפער מתועד, לא מוסתר). 32 בדיקות חדשות, כל 106 בדיקות `@ao/runtime` עוברות,
      build+lint+format נקיים.
- [x] **P10-T4 · מתכונים** — תבניות תוכנית ב-YAML, נבחרות ע"י ה-planner.
      *גמור:* מתכון תואם חוסך את **רוב** עלות התכנון.
      *כפי שמומש:* גילוי אמיתי מהמחקר, אותה תבנית בדיוק כמו P9: תשתית חלקית כבר קיימת אבל אף פעם לא
      מחוברת בפועל. `TaskUnderstanding.suggestedRecipe` (`packages/shared/src/schemas/understanding.ts`)
      כבר קיים — ה-`recon` כבר **מציע** שם מתכון. `runPlanner` (`planner.ts`) כבר מקבל `recipes?: string[]`
      ומזכיר אותם בפרומפט. אבל אף אחד מהשניים לא היה מחובר לתוכן מתכון אמיתי — `suggestedRecipe` הוא שם
      בלבד שאף פעם לא נבדק מול רישום אמיתי, ו-`recipes` הוא רשימת שמות חשופה ל-LLM בלי תוכן — התוכנית
      עדיין נבנתה **תמיד** מאפס דרך קריאת LLM יקרה (`responseSchema: PlanSchema`, `thinkingLevel: "high"`).
      זה בדיוק הפער שנסגר כאן, לא הומצא מאפס.
      **סכמה** (`packages/shared/src/schemas/recipe.ts`): `RecipeSchema` — כמעט `Plan` שלם, פחות מה שלא
      ניתן לדעת לפני ריצה קונקרטית: `tokenBudget`/`reserve` הם **שברים** מ-`budget.total` (`tokenBudgetShare`/
      `reserveShare`), לא מספרים מוחלטים — כך מתכון אחד עובד בכל רמת תקציב; `objectiveTemplate` עם placeholder
      יחיד `{{userRequest}}`. שאר השדות (agentType/fanout/DAG/mergeStrategy/successCriteria) קונקרטיים
      וסטטיים בתוך המתכון עצמו — reuse מלא של `FanoutSchema`/`StageInputSchema`/`StageContextBudgetSchema`/
      `DeliverableSchema`/`ReadPolicySchema`/`ReducerIdSchema`/`OutputContractSchema` הקיימים מ-`plan.ts`,
      לא שכפול.
      **מילוי** (`packages/core/src/recipes/instantiate.ts`) — `instantiateRecipe`: פונקציה טהורה **בלי
      גישה ל-LLMProvider בכלל** (לא רק "לא קוראת לו" — אין לה פרמטר כזה, מוכח מבנית בבדיקה), ממירה
      שברי-תקציב למספרים מוחלטים (`Math.floor(share × budgetTotal)`), ממלאת `{{userRequest}}`, מחתימה
      `runId` אמיתי. אינה טוענת "תמיד תקין" — הקורא עדיין מריץ את התוצאה דרך `validatePlan` **האמיתי**
      הקיים (P5-T1, לא ולידטור מקביל חדש). נבדק גם מול validatePlan בפועל בתקציב draft (500K) וגם בתקציב
      deep גדול פי 8 — עובר בשתיהן, מוכיח שהסקיילינג-לפי-שבר עובד לא רק "במקרה אחד".
      **בחירה** (`packages/core/src/planner/plan-with-recipe.ts`) — `planWithRecipe`: זה "נבחרות ע"י
      ה-planner" הלכה למעשה — עוטף את `runPlanner` הקיים בלי לגעת בו: `understanding.suggestedRecipe`
      מול `recipeRegistry` (Record שכבר נטען בזיכרון ע"י הקורא, `@ao/platform`, בלי I/O כאן) → אם יש
      התאמה, `instantiateRecipe` ואז `validatePlan`; אם תקין — `source: "recipe"`, **אפס** קריאות LLM
      (נבדק ישירות מול `MockLLMProvider.calls.generate.length === 0`). אם אין התאמה / השם לא רשום / התוצאה
      לא תקינה (לדוגמה agentType שלא ברישום הריצה) — נופל בחזרה ל-`runPlanner` האמיתי, כולל שמות המתכונים
      הזמינים בפרומפט (מ-`recipeRegistry` הקיים, לא כפילות קלט). 5 בדיקות שמכסות את כל הענפים, כולל בדיקה
      שתפסה בפועל bug בפיקסצ'ר של הבדיקה עצמה (agentType לא תואם בתוכנית ה-fallback) לפני שתוקן.
      **טעינה מקבצים** (`packages/platform/src/recipe-registry/`) — `listRecipeNames`/`loadRecipe`: אותה
      תבנית בדיוק כמו סוכנים (P10-T1/T2) — `recipes/<name>.yaml`, קריאה טרייה מהדיסק בכל קריאה (חם
      מובנה-בעיצוב, לא watcher), `NotFoundError`/`ConfigError` עקביים. נוספה תלות אמיתית `yaml@2.9.0`
      (כבר הייתה קיימת כתלות טרנזיטיבית ב-lockfile — לא גרסה חדשה שהומצאה) ל-`packages/platform`. 10 בדיקות,
      כולל הוכחת hot-reload תואמת ל-P10-T2.
      21 בדיקות חדשות סה"כ (6 instantiate + 5 plan-with-recipe + 10 recipe-registry), 478 בדיקות
      `@ao/core` + 80 `@ao/platform` עוברות, build+lint+format נקיים. חיבור בפועל ל-`apps/runtime` (composition
      root) נדחה בכוונה ל-P10-T5, יחד עם קבצי המתכונים האמיתיים הראשונים — לא מחווטים מנגנון ריק.
- [x] **P10-T5 · ספריית מתכונים** — ניתוח מאגר · סקירת קוד · מסמך ממקורות · מיגרציה · חילוץ נתונים.
      *גמור:* 5 מתכונים עובדים מקצה לקצה.
      *כפי שמומש:* `recipes/*.yaml` — 5 קבצים אמיתיים, כל אחד 2–3 שלבים אמיתיים מ-6 סוגי הסוכן שנבנו
      ב-P10-T3: **ניתוח מאגר** reader→analyst→writer (markdown); **סקירת קוד** reader→critic→writer
      (markdown, critic בודק בלי לתקן בעצמו); **מסמך ממקורות** reader→writer (markdown, ללא outliner —
      עקבי עם הפער התיעודי מ-P10-T3: outliner לא מבוסס-רישום); **מיגרציה** reader→coder→critic (files,
      coder בבעלות בלעדית על קובץ + `local:assemble-files`); **חילוץ נתונים** reader→analyst→coder (data).
      כל mergeStrategy הוא reducer אמיתי מ-`ReducerIdSchema` הקיים; כל deliverable.kind תואם
      `DELIVERABLE_KIND_AGENT_TYPES` הקיים ב-`plan/types.ts` (V7 עובר).
      חובר סוף-סוף ל-`apps/runtime`: `resolveRecipesDir` (זהה בעיצוב ל-`resolveAgentsDir`, לא מופשט
      למשותף — שני call sites עדיין לא תבנית) + `AppContext.recipesDir`.
      **"מקצה לקצה" אומת בפועל, לא רק "ה-YAML נטען":** הרמוני `apps/runtime/src/recipe-end-to-end.test.ts`
      מריץ את השרשרת המלאה האמיתית לכל אחד מ-5 המתכונים — `understanding.suggestedRecipe` (כמו ש-recon
      היה מפיק) → `planWithRecipe` **האמיתי** (P10-T4, אפס קריאות LLM, נבדק ישירות מול
      `plannerProvider.calls.generate.length === 0`) → `validatePlan` **האמיתי** (P5-T1) → `runScheduler`
      **האמיתי** (P5-T4) שמריץ את כל הפאן-אאוט בפועל, כשכל Task טוען את ה-`agent.md` **האמיתי** שלו
      (P10-T3, דרך `@ao/platform`'s `loadAgent`) ומריץ אותו דרך `buildAgentPrompt`/`buildAgentRequest`/
      `collectGenerate`/`parseNdjson` **האמיתיים** מול `MockLLMProvider` — לא סימולציה חלקית. כל 5 המתכונים
      מסתיימים באפס Tasks שנכשלו/נדחו-תקציבית, `schemaViolations: 0`, `done: true` בכל תוצאה.
      **באג אמיתי שנתפס באימות הזה, לא לפני:** שני ממצאים נפרדים שה-validatePlan/instantiateRecipe הבודדים
      לא היו חושפים לבד — (1) `hardCapShare` לכל שלב חייב לסכם ל-**≤~0.58** מ-`budget.total`, לא ≤1 כפי
      ש-V2 בלבד בודק: `runScheduler` מוציא כסף אמיתי מול bucket `"execution"` שהוא רק 58% מהתקציב הכולל
      (`DEFAULT_BUCKET_PERCENTAGES` הקיים), לא מול ה-budgetTotal הגולמי — תוכנית שעברה V2 (≤100%) יכולה
      עדיין להיכשל ב-`budget-rejected` באמצע ריצה אמיתית אם סכום ה-hardCap עובר את ה-58%. זו תכונה כללית
      של Ledger מ-P4/P5, לא באג ב-P10 — אבל בלי ה-harness המלא הזה 5 המתכונים היו "עוברים ולידציה" ונכשלים
      בשקט בהרצה אמיתית. כל 5 המתכונים כוילו מחדש לסכום ≈0.5 כדי לעבוד בפועל. (2) `planWithRecipe` בלע
      בשקט כשל ולידציה של מתכון (נפל חזרה ל-planner בלי שום אבחון) — נתפס תוך כדי דיבוג runId לא-תקין
      בבדיקה עצמה (`run_e2e_test` מפר את `RunIdSchema`'s `run_[A-Za-z0-9]+`, אין קו תחתון מותר). תוקן
      בקוד עצמו, לא רק בבדיקה: `PlanWithRecipeResult` מקבל `recipeValidationIssues?` אופציונלי — מאוכלס
      רק כשמתכון הותאם בשם אבל נכשל בולידציה, כדי שנפילה-חזרה עתידית תהיה ניתנת-לאבחון ולא "קופסה שחורה".
      7 בדיקות חדשות ב-`recipe-end-to-end.test.ts` (1 registry + 5×1 per-recipe e2e) + 2 ב-`recipes-dir.test.ts`,
      כל 114 בדיקות `@ao/runtime` עוברות, build+lint+format נקיים.
- [x] **P10-T6 · reducers כתוספים** — רישום ניתן להרחבה.
      *גמור:* reducer מותאם נרשם ורץ בלי לגעת בליבה.
      *כפי שמומש:* גילוי אמיתי מהמחקר: `Stage.mergeStrategy` **אף פעם לא נצרך בפועל** בקוד production —
      `mergeStrategy` מוגדר בסכמה ומופיע בכל Stage, אבל אין (היה) שום מקום ב-`packages/core` שממפה
      `ReducerId` לפונקציית reducer בפועל; `m2-scenario.test.ts` (P5) עשה dispatch ידני ב-if/else בתוך
      הבדיקה עצמה. `LOCAL_REDUCERS` הקיים (`local-reducers.ts`) הוא map קשיח ל-4 (לא 6 — `local:reduce-tree`
      ו-`llm:synthesize` צריכים ארגומנט נוסף מהקורא, לא מתאימים לצורה השטוחה, בדיוק כפי שההערה הקיימת שם
      כבר אמרה), ולא נצרך כרישום-הרצה אמיתי בשום מקום. חסימה אמיתית שנייה: `ReducerIdSchema`
      (`packages/shared`) היה `z.enum([...6...])` **סגור** — ההפך הגמור מ"ניתן להרחבה". תוקן במפורש:
      `ReducerIdSchema` נפתח ל-`z.string().min(1)` — **אותו טיפול בדיוק** ש-`Stage.agentType` כבר מקבל
      (מחרוזת פתוחה, לא enum). `BUILTIN_REDUCER_IDS` נשאר קבוע מיוצא נפרד לתיעוד/כלים. שינוי טיפוס אמיתי
      (מ-union בן 6 ערכים ל-`string`) — נבדק שאין switch/case ממצה שנשען עליו (grep), ואומת עם typecheck
      מלא על **כל** ה-monorepo (8 חבילות) שלא נשבר כלום.
      **מנגנון הרישום** (`packages/core/src/reducers/registry.ts`) — `createReducerRegistry()`: מפה
      mutable id→function, מאותחלת עם `LOCAL_REDUCERS` (4 built-ins), עם `register`/`resolve`/`has`/`list`.
      זו הדרך היחידה שהגיונית להרחיב reducers בכלל: בניגוד לסוכן (agent.md כטקסט) או מתכון (YAML), reducer
      הוא **קוד הרצה בפועל** (`Reducer<I,O>`), לא מסמך — אין פורמט קובץ שיכול "לטעון" קוד ריצה גנרית, אז
      "רישום ניתן להרחבה" אומר בדיוק מה שהוא אומר: מפה שקוד חיצוני קורא לה `.register()` בזמן ריצה.
      נוסף V9 חדש ל-`validatePlan` (`plan/validate.ts`) — **אותו פיצול בדיוק** כמו V3 ל-`agentType`/
      `knownAgentTypes`: schema פתוח + context אופציונלי (`knownReducerIds?`) שכשמסופק תופס mergeStrategy
      לא-רשום. אופציונלי כדי לא לשבור אף קורא קיים (נבדק: כן).
      **הוכחה בפועל, לא רק תיאורטית, כפי שנדרש ("נרשם **ורץ**"):** `apps/runtime/src/reducer-plugin.test.ts` —
      reducer מותאם (`pickLongest`) שאף פעם לא היה קיים בתוך `packages/core`, נכתב ישירות ב-`apps/runtime`
      (חבילה אחרת לגמרי): נרשם, נפתר, **ורץ בפועל** על `TaskResult[]` אמיתיים ומחזיר את הערך הנכון. נוסף
      מבחן שלילי: אותה תוכנית בדיוק (מתכון `repo-analysis` אמיתי מ-P10-T5, מוחלף `mergeStrategy` בזמן ריצה)
      עוברת V9 כשה-reducer רשום, **ונכשלת ב-V9** כשהוא לא — מוכיח שהבדיקה אמיתית, לא חותמת גומי.
      `packages/core` נשאר בלי שינוי לצורך *הוספת* reducer עתידי — השינוי היחיד ל-core כאן הוא בניית
      המנגנון עצמו (V9 + הרישום), אותו דפוס בדיוק כמו ש-P10-T1/T4 בנו מנגנון פעם אחת בלי לדרוש שינוי חוזר
      בהמשך.
      **בדיקת רגרסיה מלאה על כל ה-monorepo** בעקבות שינוי הסכמה: `typecheck` נקי בכל 8 החבילות/אפליקציות;
      `vitest run` מהשורש — 1443/1444 עוברות, הכשל היחיד (`docker-sandbox.test.ts`'s live-daemon probe
      ב-`@ao/tools`) הוא מגבלת סביבה קיימת-מראש (אין דימון Docker בקונטיינר המרוחק הזה) שלא נגעתי בה כלל
      השבוע — לא רגרסיה. תוך כדי הרגרסיה נתפס ותוקן גם test אמיתי קיים שהניח את ההתנהגות הישנה
      (`plan.test.ts`'s "rejects an unknown reducer id" — הוחלף בזוג בדיקות שמשקפות את ההתנהגות החדשה
      במפורש). 14 בדיקות חדשות (7 registry + 4 V9 + 3 reducer-plugin), + 2 בדיקות `reducer.test.ts` עודכנו
      + 1 ב-`plan.test.ts` הוחלפה בשתיים — `@ao/shared`: 120, `@ao/core`: 489, `@ao/runtime`: 117,
      build+lint+format נקיים.
- [x] **P10-T7 · תיעוד הרחבה** — `docs/EXTENDING.md`: סוכן, מתכון, reducer, כלי.
      *גמור:* מפתח חיצוני מוסיף סוכן לפי המדריך בלבד.
      *כפי שמומש:* `docs/EXTENDING.md` — 4 סעיפים (סוכן/מתכון/reducer/כלי), כל אחד עם דוגמה מלאה ופקודת
      אימות אמיתית שכבר קיימת (`npx vitest run agent-contract` / `recipe-end-to-end` / `reducer-plugin`).
      נוסף ל-README.md's מפת המסמכים.
      **הגמור בפועל נבדק, לא הונח:** הרצתי את סעיף 1 (הוספת סוכן) על עצמי כמו "מפתח חיצוני" — יצרתי תיקיית
      `agents/toy-verifier/` בדיוק לפי הדוגמה במדריך, והרצתי את פקודת האימות המתועדת. זה **גילה באג אמיתי**:
      `agent-contract.test.ts` (P10-T3) בדק "בדיוק 6 סוגים, לא יותר" — תיקייה חדשה שברה את הבדיקה במקום
      "להיבדק אוטומטית" כפי שהמדריך הבטיח, וגרוע מזה: הסוג החדש לא קיבל בכלל את בדיקות-החוזה שלו, כי
      ה-`describe.each` רץ על מפה קשיחה (`EXPECTED`) ולא על מה שבאמת רשום בדיסק. שני הבאגים תוקנו בפועל
      (לא רק בתיעוד): `agent-contract.test.ts` שוכתב לגזור את רשימת הסוגים דינמית מ-`listAgentTypes` בזמן
      טעינת המודול — כל תיקייה אמיתית מקבלת עכשיו את 4 בדיקות-החוזה הגנריות אוטומטית; רק בדיקת "תואם את
      טבלת ARCHITECTURE.md" נשארה מוגבלת לרשימה המתועדת (`DOCUMENTED`), כי אין טבלה לבדוק נגדה סוג לא-
      מתועד. הרצתי שוב עם `toy-verifier` נוכח — 36/36 עברו, כולל 4 הבדיקות האוטומטיות שלו — **ואז מחקתי
      את תיקיית הבדיקה הזמנית** (חוזרים ל-32/32) לפני commit, בדיוק לפי כלל ה-harness-זמני. אותו תיקון
      בדיוק הוחל מנע-מראש על `recipe-end-to-end.test.ts` (P10-T5): `RECIPE_NAMES` הוחלף מרשימה קשיחה
      לגזירה דינמית מ-`listRecipeNames`, כדי שמתכון חדש לא ידרוש עריכת קובץ הבדיקה (כל עוד סוגי הסוכנים
      שהוא משתמש בהם כבר מכוסים ב-`RESPONSES_BY_AGENT_TYPE`; אחרת — כשל ברור עם הוראה מדויקת מה להוסיף,
      לא דילוג בשקט). עדכנתי את סעיף 2 במדריך לשקף את זה במדויק.
      **הפער האמיתי היחיד שתועד בכנות, לא נבנה סביבו:** הוספת כלי מוכן-מראש לספריית `packages/tools/src/
      library/` עדיין דורשת עריכת `packages/tools` (union סגור + switch שהקומפיילר בודק) — P10 לא כלל
      בניית הרחבה-בלי-קוד לזה (לא היה אחד משבעת המשימות); תועד כשולחן פתוח, לא הוסתר ולא "תוקן" ללא סמכות.
      כל 117 בדיקות `@ao/runtime` עוברות (32+6 מתוכן דינמיות עכשיו), build+lint+format נקיים.

> **הגדרת גמור לשלב:** הוספת סוג סוכן חדש ומתכון חדש — בלי לשנות שורת קוד ב-`packages/core`.

---

<a name="p11"></a>
## P11 · Evals והקשחה `L`

**מטרה:** להפוך "נראה שזה עובד" ל"נמדד שזה עובד".

- [x] **P11-T1 · מסגרת evals** — `evals/` עם fixtures, תקציב ואסרציות.
      *גמור:* `pnpm eval` מריץ הכל ומדפיס טבלה.
      *כפי שמומש:* גילוי אמיתי מהמחקר, אותה תבנית בדיוק כמו P9/P10: אין שום תשתית eval/benchmark/golden-task
      קיימת מראש (`grep` על eval/benchmark/golden בכל הקוד לא העלה דבר מחוץ ל-TASKS.md עצמו) — **אבל**
      `apps/runtime/src/recipe-end-to-end.test.ts` (P10-T5) כבר היה בפועל בדיוק המנגנון הדרוש: מריץ שרשרת
      אמיתית `planWithRecipe` → `validatePlan` → `runScheduler` מול `MockLLMProvider`, עם תשובת NDJSON
      מקודדת-קשיח אחת לכל agentType (`RESPONSES_BY_AGENT_TYPE`), לכל אחד מ-5 המתכונים — רק שזה היה חמישה
      גופי-בדיקה נפרדים וקשיחים, לא מסגרת מונעת-נתונים. זה בדיוק מה ש-P11-T1 היה צריך לבנות **עליו**, לא
      מאפס — אותה תבנית "תשתית אמיתית קיימת עמוק בקוד, אף פעם לא מחוברת כמנגנון כללי" שחזרה גם ב-P9 וגם
      ב-P10.
      **סכמה** (`packages/shared/src/schemas/eval-case.ts`): `EvalCaseSchema` — `understanding` הוא
      `TaskUnderstandingSchema.omit({ suggestedRecipe: true })` בכוונה: ה-runner הוא זה שממלא
      `suggestedRecipe: recipeName`, כדי שקובץ fixture לא יוכל לסתור את עצמו (לרשום מתכון אחד ב-`recipeName`
      ואחר ב-`understanding.suggestedRecipe`). `assertions` (`maxTokensSpent`/`maxDurationMs`) שני השדות
      אופציונליים — זה בדיוק "fixtures, תקציב ואסרציות" מנוסח המשימה: תקציב נבדק מול `TokenReport.grandTotalSpent`
      האמיתי (`@ao/core`'s `buildTokenReport`, P4-T8, **נעשה בו reuse מלא**, לא נבנה מחדש), לא מספר מומצא.
      6 בדיקות ב-`eval-case.test.ts`.
      **רישום מקבצים** (`packages/platform/src/eval-registry/loader.ts`): `listEvalCaseIds`/`loadEvalCase` —
      **אותו דפוס בדיוק** כמו `agent-registry`/`recipe-registry` (P10-T1/T4): `evals/cases/<id>.yaml`, קריאה
      טרייה מהדיסק בכל קריאה (חם מובנה-בעיצוב, לא watcher, כמו כל השאר), `NotFoundError`/`ConfigError` עקביים,
      אימות ש-`id` בקובץ תואם את שם הקובץ. 10 בדיקות ב-`loader.test.ts`.
      **חיפוש תיקיית evals/**: `apps/runtime/src/agents-dir.ts`/`recipes-dir.ts` הם פרטיים ל-`apps/runtime`
      (לא מיוצאים דרך `dist/index.js` של החבילה הזו — זו נקודת הכניסה שמרימה שרת HTTP, לא ספרייה ל-import
      מ-`apps/evals`). `apps/evals` היה צריך שלוש פונקציות דומות (agents/recipes/evals) — נקודה שבה העתקה
      נוספת של אותן ~10 שורות הפכה יקרה יותר מהפשטה. חולץ `resolveWorkspaceSubdir` חדש
      (`packages/platform/src/paths/workspace-subdir.ts`) — "env var override, אחרת `findWorkspaceRoot`+join"
      — **בלי לגעת** בשתי הפונקציות הקיימות של `apps/runtime` (כבר שולחו, כבר בדוקות, אין סיבה). שלוש
      עטיפות דקות-שורה-אחת ב-`apps/evals/src/{agents,recipes,evals}-dir.ts` בונות עליו, עם אותם שמות משתני
      סביבה בדיוק (`AO_AGENTS_DIR`/`AO_RECIPES_DIR`/`AO_EVALS_DIR`) כדי שדריסה תחול זהה על שתי האפליקציות.
      5 בדיקות ב-`workspace-subdir.test.ts`.
      **`apps/evals`** — אפליקציית composition-root חדשה, מבנה זהה ל-`apps/runtime` (`tsc -b`, `node
      dist/index.js`): `run-case.ts`'s `runEvalCase` הוא **הכללה** של `recipe-end-to-end.test.ts`'s
      `runRecipeEndToEnd` הפרטית ל-פונקציה מונעת-`EvalCase`: אותה שרשרת אמיתית בדיוק
      (`planWithRecipe`/`validatePlan`/`runScheduler`/`loadAgent`/`buildAgentPrompt`/`buildAgentRequest`/
      `collectGenerate`/`parseNdjson`), אבל בודקת גם `source === "recipe"` (אפס קריאות LLM לתכנון — נבדק
      מבנית: `plannerProvider` מקבל `responses: []` בכוונה, כך שנפילה-חזרה אמיתית ל-planner תיכשל בקול רם
      במקום להסוות fixture שבור בתוכנית שנוצרה מ-LLM), שכל outcome הצליח עם `schemaViolations === 0` ו-
      `done === true`, ואז את שני סייגי ה-assertions האופציונליים מול `buildTokenReport` וזמן-קיר אמיתי
      (`performance.now()`). `Ledger`'s `pricing` מחובר ל-`resolveModelEntry` **בדיוק** כמו
      `apps/runtime/src/chat/run-chat.ts` (`pricing: (id) => resolveModelEntry(id)?.pricing`) — לא מקור חדש
      של מחיר לא-מאומת, reuse של אותו אחד קיים. `canned-responses.ts` **לא** מיובא מ-`recipe-end-to-end.test.ts`
      של `apps/runtime` בכוונה — זה קובץ בדיקה פרטי, לא ייצוא ספרייה, וזול יותר לשכפל כ-30 שורות fixture-glue
      כאן מאשר להפוך בדיקה פרטית לתלות חוצה-אפליקציות. `report-table.ts`'s `printReportTable` היא ה"מדפיס
      טבלה" המילולי מהגדרת-הגמור — `console.table` (אותה תקדימה בדיוק כמו `packages/providers/src/demo.ts`'s
      CLI). `index.ts` תומך גם ב-`--tag=` (חוזר) לסינון — המנגנון ש-P11-T5's "תת-קבוצה זולה ב-CI" ידרוש
      בהמשך, לא מחובר לשום job עדיין. שורש: `"eval": "pnpm --filter @ao/evals start"` עם `preeval` שבונה
      את `@ao/evals` ואת כל תלויות ה-workspace שלו (`pnpm --filter @ao/evals... build`).
      **3 fixtures לדוגמה** (`evals/cases/*.yaml`) — `repo-analysis-small-he` (עברית, markdown),
      `code-review-en` (אנגלית, markdown), `data-extraction-he` (עברית, deliverable מסוג `data` עם שלב
      `coder` אמיתי) — כל אחד מתעד בתיאור שלו-עצמו **בפירוש** שהוא אינו אחד מ-12 משימות הזהב הנדרשות
      ב-P11-T2 (אלה עדיין לא נכתבו) אלא רק הוכחה שהמסגרת רצה. **אימות אמיתי, לא רק ולידציה סטטית** (בדיוק
      כפי שנדרש): נוצר `evals/cases/tmp-verify-failure.yaml` זמני עם `maxTokensSpent: 1` בלתי-אפשרי — הרצה
      אמיתית של `pnpm eval` הראתה שורת `FAIL` עם הסיבה המדויקת ("grandTotalSpent ... exceeds
      maxTokensSpent 1") ו-`exit code 1` אמיתי; אז נערך לרפרנס `recipeName: nonexistent-recipe` — הראה
      ש-`index.ts`'s try/catch תופס את ה-`NotFoundError` האמיתי מ-`loadRecipe` ומדווח "threw instead of
      completing" עם ה-stack האמיתי, שוב עם `exit code 1`. שני המקרים הוכיחו שהמסגרת לא "חותמת גומי" —
      **נמחק לפני commit**, כנדרש.
      35 בדיקות חדשות סה"כ (6 eval-case + 10 eval-registry loader + 5 workspace-subdir + 14 ב-`@ao/evals`:
      6 run-case + 4 cli-args + 4 report-table). `pnpm typecheck`/`lint`/`format:check`/`build` נקיים על כל
      10 חבילות/אפליקציות (כולל `@ao/evals` החדשה). `vitest run` מהשורש: 1478/1479 — הכשל היחיד
      (`docker-sandbox.test.ts`'s live-daemon probe ב-`@ao/tools`) הוא בדיוק אותה מגבלת-סביבה קיימת-מראש
      שתועדה ב-P10-T6 (אין דימון Docker בקונטיינר המרוחק הזה) — לא נגעתי ב-`packages/tools` כלל, לא רגרסיה.
      **פערים אמיתיים שתועדו בכנות, לא הוסתרו:** (1) 3 ה-fixtures הנוכחיים רחוקים מאוד מ-"לפחות 12 משימות
      זהב שמכסות קטן/גדול, קוד/מסמכים, ניתוח/יצירה, עברית/אנגלית" — זה **כל** P11-T2, פתוח לגמרי, לא נגעתי
      בו כאן מעבר לשלוש דוגמאות-הוכחת-מנגנון. (2) כל מקרה חייב לעבור כרגע דרך נתיב ה-recipe נטול-ה-LLM
      (דטרמיניסטי מול `MockLLMProvider`) — אין עדיין מקרה שמפעיל בפועל את ה-planner האמיתי מול LLM אמיתי;
      זו בחירת-היקף מכוונת (עקבית עם כלל #6: אפס טוקנים/רשת בסוג הבדיקה הזה), לא מגבלה טכנית של הסכמה עצמה
      (`EvalCase` לא אוסרת מקרה כזה בעתיד) — לא נבנה שום קוד מת סביב האפשרות הזו כרגע. (3) מחירי המודלים
      שה-cost report מציג מגיעים מ-`MODEL_REGISTRY` הסטטי (`packages/providers/src/models.ts`) שכבר מסומן
      שם עצמו כ"best-effort"/לא-מאומת עבור חלק מהערכים — לא מקור חדש של נתון לא-מאומת, reuse של אותו אחד
      שכבר קיים ומתועד ב-`run-chat.ts`.
- [x] **P11-T2 · משימות זהב** — לפחות 12: קטנות/גדולות, קוד/מסמכים, ניתוח/יצירה, עברית/אנגלית.
      *גמור:* מכסות את שני הסולמות (קלט גדול, פלט גדול).
      *כפי שמומש:* סוגר את פער (1) שתועד ב-P11-T1 ("3 ה-fixtures הנוכחיים רחוקים מאוד מ-12 משימות זהב") —
      12 קבצי `evals/cases/*.yaml` בפועל (3 ה-fixtures מ-P11-T1 קודמו למשימות זהב אמיתיות — הוסרה מהן הערת
      "אינו אחד מ-12", לא הוחלפו), פרושים על 5 המתכונים הקיימים (`repo-analysis`/`code-review`/
      `document-from-sources`/`migration`/`data-extraction`), 6 בעברית ו-6 באנגלית, 6 מתויגים `code`
      (repo-analysis×2, code-review×2, migration×2), 3 `docs` (document-from-sources×3), 3 `data`
      (data-extraction×3), 8 `analysis` ו-4 `creation` (ומגוון ערכי `intent` אמיתיים מ-6 האפשרויות של
      `TaskUnderstandingSchema`: analyze/create/modify/research).
      **גילוי אמיתי שחייב שינוי במנגנון עצמו, לא רק בקבצי fixture:** הרצה ראשונה של `pnpm eval` עם
      fixtures מתויגים `large-input`/`large-output` חשפה ש-`inputScale`/`understanding.deliverableShape.
      estimatedSize` (P11-T1) לא היו משפיעים בפועל על הריצה — `CANNED_RESPONSES_BY_AGENT_TYPE`/
      `EVAL_SHARD_ITEMS` היו קבועים-בקוד לכל המקרים, כך ש-tag "large" היה **תווית בלבד**, בניגוד מפורש
      לכלל #2 (לא ממציאים/מקשטים נתונים). זה בדיוק תבנית "בדיקה שטחית לא הייתה תופסת" מהברירה — נתפס כי
      בדקתי בפועל (`pnpm eval`, לא רק ולידציה סטטית) שההפרש בין `small` ל-`large` היה זניח (כמה עשרות
      טוקנים מתוך ~13,000). **תוקן בקוד עצמו** (`apps/evals/src/canned-responses.ts`,
      `apps/evals/src/run-case.ts`): `buildCannedResponse(agentType, scale)`/`buildEvalShardItems(count)`
      החליפו את הקבועים — `scale` נגזר מ-`understanding.deliverableShape.estimatedSize` (small=1/medium=2/
      large=5/xlarge=9, ממופה מהשדה הקיים עצמו, לא הומצא שדה מקביל), ו-`count` נגזר משדה חדש
      `EvalCase.inputScale` (`InputScaleSchema`, `packages/shared/src/schemas/eval-case.ts`) — `small`
      (ברירת מחדל, 4 פריטים) / `large` (200 פריטים). נוסף גם `buildSyntheticEvidence` — טקסט "עדות" חוזר
      שגדל עם `inputScale`, כדי שקנה-המידה ישפיע על **כל** שלב (לא רק שלבי `shard`), כי קלט גדול אמיתי
      מזרים יותר הקשר גם לשלבים מאוחרים יותר. אומת בפועל אחרי התיקון: `code-review-large-input-he`
      (13,675 טוקנים) מול `code-review-en` (11,452, אותו scale פלט) — פער אמיתי של כ-19%; דומה עבור
      `repo-analysis-large-input-en` מול `repo-analysis-small-he`. `EvalCaseSchema` הורחב ב-`inputScale`
      אופציונלי (לא חובה) כדי ששלושת ה-fixtures מ-P11-T1 ימשיכו להיטען בלי שינוי.
      **בדיקות חדשות שמוכיחות את הקנה-מידה, לא רק מניחות אותו:** `run-case.test.ts` — שני מבחנים חדשים
      שמריצים את אותו case פעמיים (unchanged מול `inputScale: "large"`, ואז מול `estimatedSize: "xlarge"`)
      ומוודאים `tokensSpent` גדול ממש (`toBeGreaterThan`), לא רק "לא זהה". `canned-responses.test.ts` חדש
      (14 בדיקות) — לכל אחד מ-5 סוגי הסוכן: NDJSON תקין ב-scale 1, עדיין תקין (`schemaViolations: 0`,
      `done: true`) ב-scale 9 עם פלט ארוך ממש יותר, ותמיד מסתיים ב-`done`; פלוס בדיקות על
      `buildEvalShardItems` (מספר פריטים מדויק, ids/paths ייחודיים, clamp ל-1 כש-count<1).
      **אימות עם pnpm eval אמיתי** (לא רק unit tests): כל 12 המשימות — `PASS`, `schemaViolations: 0`,
      `source: recipe` (אפס קריאות LLM לתכנון) — סה"כ 163,759 טוקנים, $0.1671, 141ms. `assertions.
      maxTokensSpent` בכל אחד מ-12 הקבצים נקבע **מהמספרים האמיתיים שנצפו בהרצה**, לא ניחוש — תקרה של פי
      ~1.51–1.58 מהערך שנצפה בפועל (למשל `code-review-en`: נצפה 11,452, נקבע 18,000; היחס המדויק לכל
      אחד מ-12 הקבצים חושב בפועל, לא הוערך), כך שזה שומר-רגרסיה
      אמיתי (כפי ש-P11-T5 ידרוש) ולא מספר שרירותי.
      **מגוון scale אמיתי, לא רק תוויות:** `inputScale: large` ב-2 מקרים (repo-analysis, code-review);
      `estimatedSize: xlarge` ב-2 (document-from-sources, migration), `large` ב-1 (data-extraction) —
      כיסוי אמיתי של שני הסולמות שהגדרת-הגמור דורשת, לא רק תגיות.
      19 בדיקות חדשות (14 canned-responses + 3 eval-case inputScale + 2 run-case scale-proof). `pnpm
      typecheck`/`lint`/`format:check`/`build` נקיים על כל 10 חבילות. `vitest run` מהשורש: 1497/1498 —
      הכשל היחיד הוא **אותה** מגבלת-סביבה מ-P10-T6/P11-T1 (`docker-sandbox.test.ts`, אין דימון Docker
      בקונטיינר), לא רגרסיה.
      **פערים שנותרו, מתועדים בכנות:** (1) כל 12 המקרים עדיין עוברים רק דרך נתיב ה-recipe נטול-LLM
      (המשך מכוון של הפער שתועד ב-P11-T1). (2) שופט איכות/rubric (P11-T4) עדיין לא קיים — האסרציות כאן
      מכניות בלבד (schema/success/תקציב/זמן), לא איכות תוכן. (3) קטגוריית `data` (3 מקרים) נוספה כדומיין
      שלישי מעבר לשני הדומיינים שהמשימה דרשה במפורש ("קוד/מסמכים") — לא תחליף להם, שניהם מכוסים במלואם
      בנפרד (6 code, 3 docs).
- [x] **P11-T3 · מדדים** — טוקנים, זמן, פגיעות מטמון, הפרות סכמה, עמידה בקריטריונים, הידרדרויות, המשכות.
      *גמור:* נשמרים לאורך זמן · נסיגה מזוהה אוטומטית.
      *כפי שמומש:* גילוי אמיתי מהמחקר, אותה תבנית בדיוק כמו P9/P10/P11-T1: `packages/core/src/continuation/
      continuation.ts`'s `runWithContinuation` (P5-T8, PROTOCOLS.md §5 — "עד 3 המשכות ל-Task") **קיים,
      בדוק-יחידה במלואו, ואף פעם לא נצרך בשום קוד ריצה אמיתי** — לא ב-`apps/runtime`, ואפילו לא ב-
      `recipe-end-to-end.test.ts` (P10-T5) שהוא ה-harness האמיתי הקרוב ביותר; כל מקום קורא ל-`collectGenerate`
      הגולמי בלבד. זו בדיוק תבנית "תשתית אמיתית קיימת עמוק בקוד, אף פעם לא מחוברת" — נסגרה כאן **בתוך
      `@ao/evals` בלבד** (לא ב-`apps/runtime`, שנשאר בדיוק כפי שהיה — חיווט ה-continuation האמיתי לתזמון
      הייצור עצמו נשאר פער תיעודי-בכנות, לא "תוקן" מחוץ להיקף P11).
      **מנגנון**: `apps/evals/src/canned-responses.ts`'s `splitForContinuation` — מפצל תגובה מתוכננת לשני
      חצאים אמיתיים (שורות NDJSON שלמות, לא גזירת-תווים), שומר תמיד את שורת ה-`done` בחצי השני. `run-case.ts`
      קורא ל-`runWithContinuation` האמיתי (לא מחקה אותו) על כל Task, כשה-`taskProvider` מוזן עם 2 תשובות
      (`finishReason: "max_tokens"` ואז `"stop"`) **רק** כש-`estimatedSize: xlarge` **וגם** `agentType` הוא
      `writer`/`coder` — שני סוגי הסוכן היחידים מבין 5 שבאמת מייצרים תוכן מהותי (ל-reader/analyst/critic אין
      "פלט גדול" גם במשימת xlarge, אותו דבר בעולם האמיתי: ה-recon לא הופך לארוך יותר רק כי המסמך הסופי גדול).
      **באג אמיתי שנתפס בהרצת pnpm eval אמיתית, לא בבדיקת יחידה**: הגרסה הראשונה תנתה את `useContinuation`
      **לפי המקרה כולו** (לא לפי agentType) — הרצה בפועל הראתה `continuationAttempts: 5`/`7` על שני מקרי
      ה-xlarge (במקום 1/3 הצפוי), כי גם שלבי ה-reader (shard, 4/3 משימות) "נזקקו" להמשכה בטעות. תוקן בקוד
      עצמו (לא רק בתיעוד): הגבלה מפורשת ל-`writer`/`coder`; אומת שוב — `document-from-sources-large-output-he`:
      1 המשכה (writer, single-mode), `migration-code-large-output-en`: 3 המשכות (coder, shard count=3) —
      תואם בדיוק את מבנה ה-Stage האמיתי מהמתכון. `maxTokensSpent` של שני המקרים עודכן פעמיים בעקבות זה
      (מהמספרים האמיתיים שנצפו בכל שלב) — לא הוקפא על ניחוש ביניים.
      **מדדים חדשים** (`EvalCaseRunResult`): `continuationAttempts` (סכום אמיתי מ-`ContinuationResult.attempts.
      length`), `cacheHitTokens` (סכום `Usage.cachedTokens` אמיתי על פני כל קריאה — **בכנות תמיד 0 היום**:
      אף תגובת `MockLLMProvider` לא מגדירה `cachedTokens`, כי אין עדיין שכבת מטמון אמיתית מחוברת ל-harness;
      זה נתון אמיתי-ותמיד-אפס, לא הושמט ולא זויף), `criteriaMet`/`criteriaUnmet` (סכום אמיתי מ-
      `doneEnvelope.selfCheck.criteriaMet/unmet` — נתון אמיתי מתוך ה-envelope המפוענח, לא שיפוט איכות; זה
      תפקידו של השופט ב-P11-T4). `report-table.ts` מציג עמודות `continuations`/`criteria` חדשות ושורת
      "cache hits: N tokens" בסיכום.
      **נשמרים לאורך זמן**: `apps/evals/src/history.ts` — `<evalsDir>/history.jsonl` (JSON Lines), שורה
      אחת לכל `(timestamp, caseId)`, נכתב (append) ע"י כל הרצת `pnpm eval` ונשמר בגיט כקובץ עוקב-שינויים
      רגיל — "לאורך זמן" חוצה commits אמיתיים, לא רק תהליך אחד. **פער שתועד בכנות**: שמירת הקובץ הזה חוצה
      הרצות CI (שבהן ה-checkout בד"כ חד-פעמי/read-only) היא מנגנון נפרד שלא נבנה כאן — משאיר את זה ל-P11-T5,
      שממילא בונה את שכבת "תת-קבוצה זולה ב-CI" הספציפית.
      **נסיגה מזוהה אוטומטית**: `detectRegressions` — משווה כל מקרה מול הרשומה **העדכנית ביותר** (לפי
      timestamp, לא הישנה ביותר) עבור אותו `caseId` בהיסטוריה הקודמת (מקרה בלי היסטוריה קודמת — ריצה
      ראשונה אי-פעם — לא מסומן, אין מול מה להשוות). `tokensSpent`/`schemaViolations` — כל עלייה נחשבת
      נסיגה (המדדים דטרמיניסטיים לחלוטין מול `MockLLMProvider`, אז כל שינוי הוא אמיתי, לא רעש). `pass:
      true→false` נדגל; `false→true` לא (שיפור, לא נסיגה). `durationMs` — רק קפיצה של פי 3+ **וגם** מעל
      50ms (זמן-קיר אמיתי, לא דטרמיניסטי כמו טוקנים — צריך סבילות לרעש-תזמון). נסיגה **מפילה את הריצה**
      (`exitCode 1`) גם כשכל מקרה בודד עדיין עובר את ה-assertions הסטטיים שלו — זה בדיוק ההבדל בין T1/T2's
      תקרות-מוחלטות לבין T3's נסיגה-יחסית.
      **אימות אמיתי, לא רק בדיקות יחידה**: שתי הרצות `pnpm eval` רצופות על אותה 12-fixture מראות אפס
      נסיגות (דטרמיניזם אמיתי, לא רק תיאורטי). ואז — harness זמני אמיתי: הוזרקה רשומת history מזויפת
      עתידית-תאריך עם `tokensSpent: 1` עבור `repo-analysis-small-he`, הורץ `node dist/index.js` ישירות —
      הראה בפועל `"1 regression(s) detected"` + `exit code 1` עם הסיבה המדויקת ("tokensSpent regressed: 1
      -> 13545"), בעוד שכל 12 המקרים עדיין הראו `PASS` משלהם. **נמחקה לפני commit** (וגם `evals/history.jsonl`
      אופס והורץ מחדש נקי, שורה אחת אמיתית לכל אחד מ-12 המקרים).
      26 בדיקות חדשות (3 splitForContinuation + 4 ב-run-case.test.ts [xlarge ↔ continuation, non-xlarge ↔
      אפס, criteriaMet/Unmet אמיתי, cacheHitTokens כן-0] + 16 ב-history.test.ts חדש + 3 ב-report-table.test.ts).
      `pnpm typecheck`/`lint`/`format:check`/`build` נקיים על כל 10 חבילות. `vitest run` מהשורש: 1523/1524 —
      הכשל היחיד הוא **אותה** מגבלת-סביבה מ-P10-T6/P11-T1/T2 (`docker-sandbox.test.ts`), לא רגרסיה.
- [x] **P11-T4 · שופט איכות** — ציון LLM מול rubric, **בתקציב קבוע ומופרד**.
      *גמור:* עקבי בין הרצות · לא נספר בתקציב המשימה.
      *כפי שמומש:* אין תשתית judge/rubric קיימת בקוד (`grep -rli judge\|rubric` העלה רק שימוש אגבי במילה
      "judge" בתוך תגובה ב-`checkpoint/signals.ts`, לא מנגנון) — נבנה מאפס, אבל **תוך reuse מלא** של תשתית
      אמיתית קיימת: `Ledger`+`runAdmitted` (P4), `GenerateRequest.responseSchema` (אותו דפוס בדיוק כמו
      `recon.ts`'s `runRecon`), ו-`TaskUnderstanding.acceptanceCriteria` **הקיים כבר בכל EvalCase** — לא
      הומצא שדה "rubric" נפרד: `rubricFromAcceptanceCriteria` (`apps/evals/src/judge.ts`) הופך כל מחרוזת
      קריטריון קיימת לקריטריון-משוקלל-שווה, אין כפילות נתונים.
      **הפרדה מבנית, לא רק מוסכמת**: `judgeDeliverable` יוצר **`Ledger` חדש משלו** (`JUDGE_BUDGET_TOKENS =
      20,000`, קבוע, בלתי-תלוי ב-`budgetTotal` של המשימה) בתוך הפונקציה עצמה — לא מקבל ledger מבחוץ, כך
      שאין שום דרך מבנית שההוצאה שלו "תדלוף" ל-Ledger של המשימה. `JudgedEvalCaseRunResult`
      (`report-table.ts`) עוטף `EvalCaseRunResult` עם `judgeScore`/`judgeTokensSpent` כשדות **נפרדים**, לא
      מוזגים ל-`tokensSpent` — אומת ישירות: `run-case.test.ts`'s "judging the deliverable afterward never
      changes the task's own tokensSpent" מריץ משימה אמיתית, שופט אותה בנפרד, ומוודא `tokensSpent` זהה
      לפני/אחרי. אומת גם ב-`pnpm eval` אמיתי: סה"כ הטוקנים של 12 המשימות (173,945) **זהה בדיוק** לפני ואחרי
      חיבור השופט — רק שורת "judge tokens (separate budget, not counted above): 7,484" נוספת בנפרד.
      **תוצר אמיתי לשיפוט, לא מומצא**: `apps/evals/src/deliverable-text.ts`'s `extractDeliverableText` שולף
      טקסט אמיתי מ-`NdjsonParseResult` שכל Task כבר החזיר בפועל (finding.claim/note.text/section.body/
      תוכן קובץ מ-`parsed.files`) — לא תוכן מומצא בנפרד לצורך השיפוט.
      **הכנות המרכזית של המשימה, שתועדה בפירוש**: המסגרת רצה **תמיד** מול `MockLLMProvider` (כלל #6 —
      אפס LLM/רשת אמיתיים בבדיקות מהסוג הזה), אז אין "שופט LLM אמיתי" שמעריך איכות תוכן אמיתית כאן —
      התוכן שנוצר על ידי 5 המתכונים הוא טקסט-placeholder סינתטי ("ממצא f1 לבדיקת eval" וכו'), בלי ציר
      איכות סמנטי אמיתי לשפוט. **לכן**: `mock-judge-provider.ts`'s `createMockJudgeProvider` הוא proxy
      כן-מוצהר, לא הצגה: `score = min(1, deliverableText.length / 200)` — תלוי **בפועל** באורך התוצר האמיתי
      (לא hash, לא קבוע), כדי שיהיה ניתן להוכיח בפועל "אותו קלט → אותו ציון" (עקביות) ו"קלט שונה → ציון
      שונה" (לא חותמת-גומי) בלי להתחזות להערכת-איכות סמנטית מזויפת. הרצת `pnpm eval` אמיתית מראה בפועל
      התפלגות אמיתית לא-אחידה: `data-extraction-*` (2 מקרים, תוצר JSON קצר) — `0.71`; שאר 10 המקרים
      (תוצר markdown/files ארוך יותר) — `1.00` (התקרה) — לא כל המקרים מקבלים אותו ציון, מוכיח שהמנגנון
      באמת מגיב לתוכן.
      **באג אמיתי שנתפס ע"י בדיקת יחידה, לא סקירה סטטית**: הגרסה הראשונה של `createMockJudgeProvider` חילצה
      "טקסט התוצר" מתוך הפרומפט המלא לפי סמן-התחלה בלבד (`"תוצר לבדיקה:\n"`) עד סוף המחרוזת — בדיקת "תוצר
      ריק מקבל ציון 0" נכשלה בפועל עם `0.515` (כי הטקסט שאחרי הסמן כלל גם את המשך הפרומפט — השורה הריקה
      והוראת ה-JSON הסופית — לא רק את התוצר עצמו). תוקן בקוד עצמו: `DELIVERABLE_START_MARKER`/
      `DELIVERABLE_END_MARKER` מיוצאים מ-`judge.ts` ומעטפים את התוצר בפרומפט משני הצדדים, וה-mock קורא
      בדיוק את הטווח שביניהם. נבדק שוב — עובר.
      19 בדיקות חדשות (8 ב-judge.test.ts + 5 ב-mock-judge-provider.test.ts + 4 ב-deliverable-text.test.ts +
      2 אינטגרציה ב-run-case.test.ts). `pnpm typecheck`/`lint`/`format:check`/`build` נקיים על כל 10
      החבילות. `vitest run` מהשורש: 1542/1543 — הכשל היחיד הוא **אותה** מגבלת-סביבה מ-P10-T6/P11-T1/T2/T3
      (`docker-sandbox.test.ts`), לא רגרסיה.
      **פער שנותר, מתועד בכנות**: כפי שלעיל — שיפוט תוכן-אמיתי (לא placeholder) ידרוש ספק LLM אמיתי, שאסור
      בסוג הבדיקה הזה לפי כלל #6; ה-mock כאן מוכיח שהצנרת (rubric→prompt→parse→ציון-משוקלל, תקציב נפרד,
      עקביות) עובדת נכון, לא שהתוכן הסינתטי "איכותי".
- [x] **P11-T5 · נסיגות עלות** — סף שנכשל כשמשימה מתייקרת מעל X%.
      *גמור:* תת-קבוצה זולה רצה ב-CI.
      *כפי שמומש:* מנגנון **נפרד במכוון** מ-`detectRegressions` של P11-T3, לא כפילות: `history.jsonl`
      (T3) גדל בכל הרצה ומשווה מול הרשומה **האחרונה** בלבד (כל עלייה = נסיגה, בלי סבילות) — טוב למשוב
      מקומי, אבל לא מתאים ל-CI (הפער שתועד ב-T3 עצמו: ל-`history.jsonl` "אין לאן לנחות" לאורך זמן ב-checkout
      ephemeral). `apps/evals/src/cost-baseline.ts` הוא במקום זאת **קובץ snapshot קטן ומחויב-בגיט**
      (`evals/cost-baseline.json`) שמתעדכן **בכוונה** (לא אוטומטית בכל הרצה), עם `checkCostRegressions`
      שבודק סף אחוזי אמיתי (`COST_REGRESSION_THRESHOLD_PERCENT = 25`) — בדיוק ניסוח המשימה "מתייקרת מעל X%",
      לא כל שינוי.
      **"תת-קבוצה זולה"**: נעשה reuse מלא של מנגנון `--tag=` הקיים (P11-T1) — לא נבנה מנגנון סינון חדש.
      4 מתוך 12 המשימות תויגו `ci-cheap` (`code-review-en`, `data-extraction-he`,
      `document-from-sources-small-en`, `repo-analysis-small-he`) — אחת לכל דומיין (code/data/docs) פלוס
      שנייה עם `code`, שתיים עברית ושתיים אנגלית, כולן בסולם `small` (הכי זול/מהיר). `evals/cost-baseline.json`
      נבנה **מהמספרים האמיתיים שנצפו בהרצה בפועל** של `pnpm eval -- --tag=ci-cheap` (לא ניחוש): 11,452 /
      12,987 / 10,989 / 13,545 טוקנים, בהתאמה.
      **CI מחובר בפועל**: `.github/workflows/ci.yml` — שלב חדש "Eval cost regression (cheap subset)" מריץ
      `pnpm eval -- --tag=ci-cheap` על שלוש הפלטפורמות (`ubuntu-latest`/`windows-latest`/`macos-latest`,
      אותו מטריקס קיים — עקבי עם ADR-011: Windows הוא יעד מדרגה ראשונה, לא קישוט). אומת בפועל ש-
      `pnpm eval -- --tag=ci-cheap` מעביר את ה-flag דרך שכבת ה-`pnpm --filter` המקוננת עד ל-CLI בפועל
      (נבדק ידנית: "running 4 of 12 eval case(s)").
      **אימות אמיתי של הסף עצמו, לא רק בדיקת יחידה**: לאחר יצירת ה-baseline האמיתי, בוצע harness זמני —
      עריכת `evals/cost-baseline.json` בפועל כך ש-`repo-analysis-small-he`'s `tokensSpent` הבסיס הורד
      ל-5000 (מתחת ל-13,545 האמיתי בהרבה), הרצה אמיתית של `node dist/index.js --tag=ci-cheap` הראתה
      "1 cost regression(s) detected... tokensSpent 13545 is 170.9% above baseline 5000 (threshold: 25%)"
      ו-`exit code 1`, בעוד ששאר 3 המקרים עדיין `PASS`. **שוחזר ה-baseline האמיתי לפני commit**.
      11 בדיקות חדשות ב-`cost-baseline.test.ts` + 2 ב-`report-table.test.ts`. `pnpm typecheck`/`lint`/
      `format:check`/`build` נקיים על כל 10 החבילות. `vitest run` מהשורש: 1555/1556 — הכשל היחיד הוא
      **אותה** מגבלת-סביבה מ-P10-T6/P11-T1–T4 (`docker-sandbox.test.ts`), לא רגרסיה.
      **פער שנותר, מתועד בכנות**: `evals/history.jsonl` (T3) עדיין נכתב (append) גם כשה-CI מריץ
      `pnpm eval` — ב-checkout ephemeral זה נשאר שינוי מקומי לא-מחויב שנזרק בסוף הריצה, לא רגרסיה (הצעד
      עצמו לא בודק ניקיון של עץ העבודה) אבל גם לא "נשמר לאורך זמן" עבור ריצות CI עצמן — זה בדיוק הפער
      שתועד כבר ב-T3 ולא נסגר כאן; `cost-baseline.json` (מנגנון נפרד, מחויב-בכוונה) הוא הפתרון האמיתי
      לצורך הספציפי הזה של CI, לא תיקון לפער של T3.
- [x] **P11-T6 · סקירת אבטחה** 🪟 — כל [`ARCHITECTURE.md` §11](ARCHITECTURE.md#11-אבטחה-ופרטיות)
      + חדירה לארגז החול **בשלוש הפלטפורמות בנפרד**. סעיף ייעודי: **מה בפועל לא מבודד ב-Windows מקורי**,
      והאם ההצהרה ב-UI מדויקת.
      *גמור:* דוח כתוב · כל ממצא סגור או מתועד כמודע · **פער בידוד ב-Windows מתועד במפורש ומוצג למשתמש**.
      *כפי שמומש:* דוח מלא — [`docs/SECURITY_REVIEW.md`](SECURITY_REVIEW.md) + [ADR-017](DECISIONS.md#adr-017).
      **הגבלת סביבה כנה מלכתחילה** (כמו בכל שלב קודם): הסשן הזה Linux בלבד, ללא Docker daemon (אותה
      מגבלה מ-P10-T6/P11-T1–T5) וללא גישה ל-macOS/Windows — כל ממצא מסומן בדוח במפורש "מאומת בפועל"
      (Linux, תהליכים אמיתיים) מול "סקירת קוד בלבד" (macOS/Windows/Docker-run).
      **גילוי מרכזי שקבע את כל הניתוח**: `packages/tools` (Sandbox+toolsmith) **אינה תלות של
      `apps/runtime` בכלל** (`grep -rln "@ao/tools" --include="*.json"` — רק `packages/tools`/
      `packages/core`; אפס `runToolsmith`/`RunLocalTool`/`spawn` ב-`apps/runtime/src`) — אותה תבנית
      "תשתית אמיתית קיימת, אף פעם לא מחוברת" שחזרה ב-P9/P10/P11-T1–T3. משמעות: **אין וקטור התקפה חי
      במוצר הרץ היום** — הממצאים הבאים אמיתיים ברמת הספרייה, והופכים לחור אמיתי ברגע שמישהו יחבר את
      ה-sandbox לזרימת ה-run. זו גם התשובה ל"האם ההצהרה ב-UI מדויקת": **אין הצהרה כלל** (`grep -rl
      "sandbox\|Sandbox" apps/web/src apps/runtime/src` — אפס) — לא מוסתרת, פשוט לא מחוברת.
      **שני ממצאים חדשים, מאומתים בפועל על Linux** (`linux-sandbox.pentest.test.ts`'s חבילת "KNOWN GAP"
      החדשה, 3 בדיקות): (1) `capabilities.pathJail: true` **לא** אוכף בידוד מערכת-קבצים אמיתי — נבדק
      רק ה-`cwd` שמועבר ל-`Sandbox.run` לפני ההרצה, לא מה שהתהליך הרץ בפועל יכול לגשת אליו; סקריפט
      עם `networkBlocking: true` **שעבד בפועל** (חסימת רשת אמיתית ומאומתת) הצליח בכל זאת לקרוא
      `/etc/passwd` ולכתוב קובץ ל-`/tmp`, שניהם מחוץ ל-`stagingRoot`, דרך נתיבים מוחלטים. סקירת קוד של
      `darwin-sandbox.ts`/`windows-sandbox.ts` מראה **אותו דפוס בדיוק** — זה פער **רחב יותר** ממה
      שהמשימה ציפתה ("מה לא מבודד ב-Windows") — הוא משותף לשלוש הפלטפורמות הלא-Docker, לא ייחודי
      ל-Windows. רק Docker מבודד באמת (bind-mount אמיתי של הקונטיינר). (2) `posix-exec.ts` מעביר את
      `process.env` **המלא** של תהליך-האב לתהליך-הבן (`{ ...process.env, ...options.env }`) — כולל
      סודות אם קיימים כ-env vars; `apps/runtime/src/index.ts` בפועל קורא `process.env["GEMINI_API_KEY"]`
      — מסלול לגיטימי ונפוץ. מאומת בפועל: env מזויף שהוזרק ל-`process.env` בסשן הזה הודלף במלואו
      לסקריפט. Docker לא נפגע (`docker run` לא מעביר env בלי `-e` מפורש, ואין כזה ב-`dockerArgs`).
      **לפי בקשה מפורשת של המשתמש**: תועד במלואו, **לא תוקן** — לא בוצע התיקון האמיתי (mount namespace
      + chroot ב-Linux, בלי native code, עקבי עם ADR-012) ולא נגעתי בקוד הייצור (`capabilities.ts`,
      טבלת ARCHITECTURE.md §8) בסבב הזה, כדי לא לערבב תיקון-הצהרה עם תיקון מסוכן בלי החלטה נפרדת. שני
      הממצאים **נשארים פתוחים ומתועדים** — לא "סגורים" בכוונה, בדיוק לפי הגדרת-הגמור ("סגור **או**
      מתועד כמודע"). המלצות מדורגות (תיקון env זול קודם, אז תיקון-הצהרה, אז mount namespace אמיתי)
      ב-`SECURITY_REVIEW.md` §5.
      **הפער הרחב מ-Windows-בלבד מוצג במפורש** (הדרישה הספציפית של המשימה): §3.1.1 ב-הדוח מסביר
      במפורש שהפער חל על Linux (מאומת) + macOS/Windows (סקירת קוד, אותו דפוס) — לא רק Windows.
      3 בדיקות חדשות (חבילת "KNOWN GAP" — קריאה/כתיבה מחוץ ל-stagingRoot, דליפת env), כולן עוברות
      (מתעדות התנהגות קיימת בכוונה — טריפוויר לעתיד, לא יעד-מעבר). `pnpm typecheck`/`lint`/
      `format:check`/`build` נקיים.
- [x] **P11-T7 · עומס** — 100MB קלט · 20 סוכנים מקבילים · 500 ארטיפקטים.
      *גמור:* אין דליפת זיכרון · ה-UI נשאר רספונסיבי.
      *כפי שמומש:* **גילוי אמיתי מהמחקר, אותה תבנית בדיוק כמו P11-T6**: לפני בניית ה-load test, בדקתי
      אם ה-UI/שרת הרץ בפועל בכלל מריץ תוכניות מרובות-שלבים — ומצאתי ש-`apps/runtime/src/chat/run-chat.ts`
      (הצ'אט האמיתי, לא סביבת-בדיקות) **לא קורא ל-`runScheduler` בכלל**, ולא ל-`runPlanner`/`planWithRecipe`/
      `runRecon` — מאומת גם בהערה מפורשת בקוד עצמו (`run-registry.ts`: *"even though nothing in
      apps/runtime calls runScheduler today"*). הצ'אט החי הוא שיחה חד-סוכן; ה-Plan/Scheduler/fan-out
      המלא (P5/P6/P10) קיים כספרייה בדוקה אבל **לא מחובר לזרימת ה-run האמיתית**, בדיוק כמו הממצא המרכזי
      ב-P11-T6 (`packages/tools`). המסקנה: **אין דרך אמיתית לבדוק "20 סוכנים מקבילים דרך UI רספונסיבי"**
      כי אין UI מחובר להריץ מולו — לפי בקשה מפורשת של המשתמש, ההיקף צומצם ל**בדיקת עומס אמיתית ברמת
      packages/core+packages/ingest** (המנוע האמיתי, לא מוק) **בלי** תביעה כוזבת ל"UI נשאר רספונסיבי".
      **בדיקת עומס אמיתית שהורצה בפועל** (harness זמני, נמחק לפני commit — 8 איטרציות מלאות, כל אחת
      עם שלושת התרחישים ברצף, מדידת זיכרון עם `--expose-gc` בין איטרציות):
      - **100MB קלט אמיתי** — `@ao/ingest`'s `ingestFiles` **האמיתי** (לא מוק) על 50 קבצי TS סינתטיים
        (2MB כל אחד = 100MB), כולל hash+extract+chunk אמיתיים: ~900–970ms לאיטרציה, **50/50 ארטיפקטים,
        0 gaps** בעקביות על פני כל 8 האיטרציות.
      - **20 סוכנים מקבילים אמיתי** — `@ao/core`'s `runScheduler` **האמיתי** (לא סימולציה) על תוכנית
        אמיתית שנוצרה מ-`instantiateRecipe` (מתכון `repo-analysis`, P10-T4), עם שלב `read` שנכפה עליו
        `fanout: {mode: shard, count: 20, maxParallel: 20}`. מונה concurrency אמיתי בתוך `runTask`
        (עולה/יורד סביב עיכוב מלאכותי של 150ms) מוכיח **`maxConcurrent: 20` בפועל** בכל 8 האיטרציות —
        לא רק "לא נכשל", אלא concurrency אמיתי נמדד: ~452ms זמן-קיר לעומת ~3000ms שהיה נדרש בהרצה
        טורית (20×150ms) — פי ~6.6 מהיר יותר, מוכיח פאן-אאוט אמיתי. (הבדיקות הקיימות `pool.test.ts`/
        `scheduler.test.ts`'s property tests על תקרת concurrency — P5-T4 — כבר מכסות את זה **מבנית**;
        זו בדיקה **בקנה-מידה** — 20 משימות אמיתיות תחת עומס נלווה, לא נבנתה מחדש).
      - **500 ארטיפקטים אמיתי** — כתיבת 500 קבצים אמיתיים לדיסק דרך `artifact-writer.ts`'s
        `resolveWithinStagingRoot`/`computeSha256` **האמיתיים** (לא ממומשים-מחדש): 8–11ms לאיטרציה,
        500/500 הצליחו בכל פעם, אין דחיות jail שגויות.
      **אין דליפת זיכרון — נמדד, לא הונח**: `heapUsed` (אחרי `global.gc()` מפורש בכל איטרציה) על פני
      8 איטרציות מלאות (כל אחת 100MB+20 מקבילים+500 כתיבות): `30.3, 30.4, 28.1, 28.1, 28.2, 28.2, 28.3,
      28.3` MB — ממוצע חצי ראשון 29.2MB, ממוצע חצי שני 28.3MB, **הפרש -1.0MB (יורד, לא עולה)**. `rss`
      עולה בהתחלה (~212MB→~268MB) ואז מתייצב — עקבי עם התחממות-קאש רגילה, לא דליפה מתמשכת.
      **פער שנותר, מתועד בכנות (לא "עקוף")**: "ה-UI נשאר רספונסיבי" **לא נבדק ולא ניתן לבדיקה כרגע** —
      אין נתיב חי מה-UI ל-`runScheduler`/`ingestFiles` בכלל (הממצא לעיל). ברגע שמישהו יחבר את
      `apps/runtime` ל-Plan/Scheduler האמיתיים (אותו חיווט עתידי שנדרש גם ב-P11-T6), בדיקת רספונסיביות
      UI אמיתית (למשל דרך Playwright מול `apps/web`+`apps/runtime` תחת עומס) תהיה משימה נפרדת שדורשת
      את החיווט הזה קודם — לא נבנתה כאן סימולציה מזויפת שלו.
      `pnpm typecheck`/`lint`/`format:check`/`build`/`test` נקיים (אין שינוי קוד ייצור בטאסק הזה — רק
      תיעוד + הרצת harness זמני אמיתי שנמחק).
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
