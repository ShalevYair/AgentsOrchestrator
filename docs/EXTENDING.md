# מדריך הרחבה

מסמך זה מיועד למי שמוסיף **סוג סוכן**, **מתכון**, **reducer**, או **כלי** למתזמר הסוכנים — בלי לגעת
ב-`packages/core`. כל סעיף מתאר מנגנון אמיתי וקיים (נבנה ונבדק ב-[P10](TASKS.md#p10)), לא תכנון עתידי.
לפני שממשיכים, כדאי להכיר את [`ARCHITECTURE.md`](ARCHITECTURE.md) ו-[`PROTOCOLS.md`](PROTOCOLS.md).

## תוכן

1. [הוספת סוג סוכן](#1-הוספת-סוג-סוכן)
2. [הוספת מתכון](#2-הוספת-מתכון)
3. [הוספת reducer](#3-הוספת-reducer)
4. [הוספת כלי](#4-הוספת-כלי)

---

## 1. הוספת סוג סוכן

**איפה:** `agents/<type>/` בשורש המאגר (ליד `packages/` ו-`apps/`) — לא בתוך אף חבילה. שני קבצים:
`agent.json` (חוזה) ו-`agent.md` (פרומפט).

**חשוב לדעת לפני שמתחילים:** המנגנון הזה מיועד ל**סוכני worker** שפלטם NDJSON חופשי-צורה (ראו
[`PROTOCOLS.md` §3](PROTOCOLS.md#3-חוזה-פלט-סוכן--ndjson)) — בדיוק כמו ששת הסוכנים הקיימים
(`reader`/`analyst`/`coder`/`writer`/`critic`/`synthesizer`). סוכני `recon`/`planner`/`checkpoint`/
`outliner`/`toolsmith` **אינם** מוגדרים כאן: הם מחזירים אובייקט JSON יחיד דרך מנגנון `responseSchema` של
Gemini, לא NDJSON, ולכן הפרומפט שלהם מקודד ישירות ב-`packages/core` (למשל `packages/core/src/recon/recon.ts`'s
`buildReconPrompt`). אם הסוכן החדש שלכם דומה לאלה (פלט מובנה יחיד, לא רצף שורות) — זה לא המדריך הנכון,
פנו למתחזק.

### שלב 1 — `agent.json`

```jsonc
{
  "type": "my-agent",              // חייב לתאום את שם התיקייה
  "displayName": "שם לתצוגה",
  "tier": "worker",                 // cheap | worker | synth — ARCHITECTURE.md §4
  "thinkingLevel": "medium",        // low | medium | high
  "outputContract": {
    "schemaRef": "NdjsonEnvelope",  // כרגע הערך היחיד האמיתי — ראו הערה למטה
    "format": "ndjson",
    "maxOutputTokens": 8000
  },
  "contextBudget": { "default": 30000, "max": 60000 },
  "supportsFanout": ["shard", "single"],  // shard|ensemble|debate|pipeline|single — ARCHITECTURE.md §4
  "requiredInputs": ["artifacts"],  // מחרוזות תיעודיות חופשיות, לא ולידציה אכיפה כרגע
  "promptFile": "agent.md",
  "temperature": 0.2
}
```

`schemaRef: "NdjsonEnvelope"` הוא הערך היחיד ש-`@ao/platform`'s `resolveOutputSchema` מכיר כרגע: כל
סוכני ה-worker מאומתים בפועל מול אותה `NdjsonEnvelopeSchema` יחידה (הפרסר לא מבחין בין סוגי סוכן). ערך
צר יותר (סכמה ספציפית-לסוג) ידרוש קודם תמיכה אמיתית בפרסר — בלי זה, `{{outputSpec}}` בפרומפט יבטיח צורה
שהפרסר לא באמת אוכף, בדיוק הבאג ש-[ADR-006](DECISIONS.md#adr-006) קיים למנוע.

### שלב 2 — `agent.md`

טקסט חופשי (עברית, בהתאם למוסכמה הקיימת) עם עד 6 placeholders — כל שימוש ב-`{{שם}}` שלא מהרשימה הזו
**זורק שגיאה בזמן בניית הפרומפט** (לא משאיר `{{x}}` גולמי):

| placeholder | מה נכנס שם |
|---|---|
| `{{objective}}` | מטרת הריצה הכוללת |
| `{{shard}}` | הפלח הספציפי שהסוכן הזה אחראי עליו |
| `{{contract}}` | תיאור החוזה/מטרת השלב |
| `{{evidence}}` | ראיות/הקשר זמינים |
| `{{successCriteria}}` | רשימת קריטריוני קבלה (הופכת לבולטים אוטומטית) |
| `{{outputSpec}}` | **נגזר תמיד מהסכמה** — לעולם אל תתארו את צורת הפלט בעצמכם, `{{outputSpec}}` כבר עושה את זה |

כל שישת הסוכנים הקיימים (`agents/reader/agent.md` ודומיו) מסתיימים בהוראה מפורשת לשורת `done` יחידה —
ראו [`PROTOCOLS.md` §3](PROTOCOLS.md#3-חוזה-פלט-סוכן--ndjson) כלל 3: בלי `{"t":"done"}` הפלט נחשב חלקי.

### שלב 3 — אימות

אין צורך בשום שינוי קוד. הריצו את `apps/runtime`'s test suite — `agent-contract.test.ts` (P10-T3) סורק
את **כל** מה שתחת `agents/` ומריץ עליו בדיקת חוזה גנרית: טעינה+ולידציה מול `AgentDefinitionSchema`,
`resolveOutputSchema`, ורינדור אמיתי דרך `buildAgentPrompt` (בלי placeholder לא-פתור). התיקייה החדשה
שלכם תיבדק אוטומטית — לא צריך להוסיף שם לרשימה בשום מקום.

```bash
cd apps/runtime && npx vitest run agent-contract
```

---

## 2. הוספת מתכון

**איפה:** `recipes/<name>.yaml` בשורש המאגר. קובץ YAML יחיד לכל מתכון (לא תיקייה).

מתכון הוא כמעט `Plan` שלם ([`PROTOCOLS.md` §1](PROTOCOLS.md#1-plan--סכמת-התוכנית)) — פחות מה שלא ניתן
לדעת לפני ריצה קונקרטית: תקציבי טוקנים הם **שברים** מ-`budget.total` (לא מספרים מוחלטים), וה-`objective`
מכיל placeholder יחיד, `{{userRequest}}`.

### שלב 1 — כתיבת ה-YAML

```yaml
name: my-recipe              # חייב לתאום את שם הקובץ
displayName: השם לתצוגה
description: תיאור קצר
objectiveTemplate: "תיאור: {{userRequest}}"
readPolicy:
  maxRung: R2                 # ARCHITECTURE.md §5.2 — R2 בטוח בכל רמת תקציב (draft מתיר עד R4)
  fullReadAllowlist: []
  summarizeIf: { minRelevance: 0.4, maxFiles: 60 }
deliverables:
  - id: my-doc
    kind: markdown             # markdown|files|data — חייב סוכן מתאים באחד השלבים, ראו למטה
    target: chat
    acceptance: ["קריטריון קבלה"]
stages:
  - id: read
    name: קריאה
    goal: "תיאור קבוע של תפקיד השלב הזה"
    dependsOn: []
    agentType: reader          # חייב סוג סוכן אמיתי (§1 למעלה)
    fanout: { mode: shard, count: 4, maxParallel: 3 }
    inputs: [{ from: artifacts, select: all }]
    outputContract: { schemaRef: NdjsonEnvelope, format: ndjson, maxOutputTokens: 8000 }
    contextBudget: { maxInputTokens: 30000, cacheContract: false }
    tokenBudgetShare: { estimatedInShare: 0.11, estimatedOutShare: 0.06, hardCapShare: 0.18 }
    mergeStrategy: local:dedupe-findings   # reducer אמיתי — §3 למטה
    successCriteria: ["קריטריון"]
    onFailure: retry
    optional: false
  # ... שלבים נוספים, dependsOn מצביע לשלבים קודמים בלבד
reserveShare:
  synthesisTokensShare: 0.1
  repairTokensShare: 0.1
```

**⚠️ מלכודת אמיתית שנתפסה ב-[P10-T5](TASKS.md#p10):** סכום `hardCapShare` על כל השלבים (בלי `reserveShare`)
**חייב להישאר מתחת ל-~0.58**, לא מתחת ל-1.0 כפי ש-`validatePlan`'s V2 בלבד בודק. הסיבה: בזמן ריצה אמיתית,
`runScheduler` מוציא תקציב מול bucket בשם `"execution"` שהוא רק 58% מ-`budget.total`
(`DEFAULT_BUCKET_PERCENTAGES` ב-`packages/core/ledger/buckets.ts`) — לא מול הסכום הגולמי. תוכנית שעוברת
V2 (≤100%) יכולה עדיין להיכשל ב-`budget-rejected` **באמצע ריצה אמיתית** אם הסכום עובר את ה-58%. חמשת
המתכונים הקיימים ב-`recipes/` מכוילים לסכום ≈0.5 — השתמשו בהם כנקודת ייחוס.

### שלב 2 — חיבור ל-`suggestedRecipe`

`recon` (שלב ההבנה הראשון בכל ריצה) כבר מפיק `TaskUnderstanding.suggestedRecipe` — שם מתכון או `null`.
`planWithRecipe` (`packages/core/planner/plan-with-recipe.ts`) מתאים אותו מול `recipeRegistry` (Map
בזיכרון שהקורא בונה מ-`@ao/platform`'s `listRecipeNames`/`loadRecipe`) — אם יש התאמה, `instantiateRecipe`
בונה `Plan` קונקרטי **בלי אף קריאת LLM**, ורק אם אין התאמה (או שהתוכנית לא עוברת ולידציה) יש נפילה חזרה
ל-planner האמיתי. אין צורך לרשום את שם המתכון בשום מקום מלבד שם הקובץ עצמו.

### שלב 3 — אימות

```bash
cd apps/runtime && npx vitest run recipe-end-to-end
```

הבדיקה הזו (P10-T5) לא בודקת רק שה-YAML נטען: היא מריצה את השרשרת המלאה — `planWithRecipe` (אפס קריאות
LLM) ← `validatePlan` ← `runScheduler` בפועל על כל השלבים, כשכל Task טוען את ה-`agent.md` האמיתי שלו
ומריץ אותו מול `MockLLMProvider`. רשימת המתכונים ל-`describe.each` נגזרת אוטומטית מ-`listRecipeNames` —
המתכון החדש שלכם ייכלל בלי לגעת בקובץ הבדיקה, **בתנאי** שכל `agentType` שהוא משתמש בו כבר מופיע ב-
`RESPONSES_BY_AGENT_TYPE` שבראש הקובץ (תגובת NDJSON מדומה לכל סוג סוכן). אם המתכון משתמש בסוג סוכן חדש —
הבדיקה תיכשל בבירור ("no canned end-to-end response for agentType") עם הוראה מדויקת מה להוסיף, במקום
לדלג עליו בשקט.

---

## 3. הוספת reducer

**חשוב:** reducer הוא קוד הרצה (`Reducer<I,O>`, [`PROTOCOLS.md` §8](PROTOCOLS.md#8-reducers)), לא מסמך —
בניגוד לסוכן/מתכון, אין פורמט קובץ שיכול "לטעון" אותו. ההרחבה היא **רישום בזמן ריצה**, לא קובץ חדש.

### שלב 1 — כתיבת הפונקציה

```ts
import type { Reducer, TaskResult, ReduceOutcome } from "@ao/core";

const myReducer: Reducer<MyInput, MyOutput> = (inputs, ctx) => {
  // טהור וסינכרוני — בלי רשת, בלי I/O (PROTOCOLS.md §8: "כל reducer שאינו llm:* חייב להיות
  // טהור ודטרמיניסטי, ולהיבדק ביחידה ללא רשת")
  return { value: /* ... */, gaps: [], needsLlmStitch: false };
};
```

כותבים אותה בכל חבילה שנוחה — `apps/runtime`, פרויקט נפרד, כל מקום שמייבא `@ao/core`.

### שלב 2 — רישום

```ts
import { createReducerRegistry } from "@ao/core";

const registry = createReducerRegistry(); // מגיע כבר עם 4 ה-local:* המובנים
registry.register("custom:my-reducer", myReducer);
```

מוסכמת שם מומלצת: קידומת `custom:` (המקבילה ל-`local:`/`llm:` הקיימות) — לא נאכפת בסכמה, רק מוסכמה
למניעת התנגשות עם built-ins עתידיים.

### שלב 3 — שימוש ב-`mergeStrategy`

`Stage.mergeStrategy` (בין אם הגיע ממתכון או מ-planner) הוא מחרוזת פתוחה — `"custom:my-reducer"` תקף
מבחינת הסכמה בלי שום שינוי. כדי לתפוס `mergeStrategy` לא-רשום **לפני** זמן ריצה, מסרו את `registry.list()`
כ-`knownReducerIds` ל-`validatePlan`:

```ts
const result = validatePlan(plan, {
  ...context,
  knownReducerIds: new Set(registry.list()),
});
```

זה מפעיל את V9 — אותו דפוס בדיוק כמו V3 ל-`agentType`/`knownAgentTypes`. השדה אופציונלי: אם לא מוסרים
אותו, V9 פשוט לא רץ (לא שובר קוד קיים).

### שלב 4 — אימות

```bash
cd apps/runtime && npx vitest run reducer-plugin
```

הבדיקה הזו (P10-T6) היא ההוכחה שהמנגנון עובד מחוץ ל-`packages/core` לגמרי: reducer שנכתב ב-`apps/runtime`
נרשם, נפתר, ורץ בפועל — כולל מקרה שלילי שמוכיח ש-V9 באמת בודק ולא רק "עובר תמיד".

---

## 4. הוספת כלי

יש שני נתיבים שונים ל"כלי" (`LocalTool`, [`PROTOCOLS.md` §11](PROTOCOLS.md#11-localtool)) — חשוב לדעת
איזה מהם רלוונטי:

### נתיב א' — כלי חד-פעמי (המומלץ, כבר גמיש לחלוטין)

סוכן ה-`toolsmith` (`packages/core/toolsmith/`, P7-T4) **כותב סקריפט Python/Node חדש בזמן ריצה**, בלי
שום רישום מראש — זה כבר "הוספת כלי בלי לגעת בליבה" במלואו, כי אין רישום שצריך לעקוף. אם הצורך שלכם הוא
פעולה ספציפית-למשימה (לא פעולה נפוצה שחוזרת על עצמה) — זה הנתיב.

### נתיב ב' — ספריית כלים מוכנים מראש

`packages/tools/src/library/` (P7-T5) מכילה כלים בנויים-מראש שהמתכנן בוחר לפני שמייצר חדש (חוסך את
עלות ה-toolsmith לפעולות נפוצות: ספירת קבצים, grep, וכו'). **בניגוד לסוכנים/מתכונים/reducers, זה עדיין
לא מנגנון גמיש** — הבחירה קורית דרך `LibraryIntent`, union מסוג סגור ב-`packages/tools/src/library/
registry.ts`, ו-`matchLibraryTool` הוא `switch` שנבדק ע"י הקומפיילר לכיסוי מלא. הוספת כלי מוכן-מראש חדש
דורשת בפועל עריכת `packages/tools` (הוספת ענף ל-union וה-switch) — לא רק הוספת קובץ. זה תועד כאן בכנות
כפער קיים, לא הוסתר: **P10 לא כלל בניית הרחבה-בלי-קוד לספריית הכלים המוכנים-מראש** (זה לא היה אחד משבעת
המשימות). אם צריך את זה, זו משימה נפרדת.

---

## סיכום — מה זמין היום

| מרחיבים | דורש שינוי ב-`packages/core`? | איך |
|---|---|---|
| סוג סוכן (worker, NDJSON) | לא | תיקייה חדשה תחת `agents/` |
| מתכון | לא | קובץ YAML חדש תחת `recipes/` |
| reducer | לא | `registry.register()` בזמן ריצה, מכל חבילה |
| כלי חד-פעמי | לא (כבר גמיש — toolsmith) | — |
| כלי מוכן-מראש בספרייה | **כן** (פער ידוע, לא בטווח P10) | עריכת `packages/tools/src/library/` |
