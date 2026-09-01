# פרוטוקולים וסכמות

> חלק ממערך המסמכים של [AgentsOrchestrator](../README.md). נקודת הכניסה לעבודה: **[`TASKS.md`](TASKS.md)**.
> ההקשר הארכיטקטוני: [`ARCHITECTURE.md`](ARCHITECTURE.md)

המסמך הזה מגדיר את **החוזים בין הרכיבים**. הם מה שמאפשר לבנות שלבים שונים במקביל ובלי תיאום מתמיד.

**כלל ברזל:** כל סכמה כאן מוגדרת ב-[Zod](https://zod.dev) תחת `packages/shared/schemas/`, ומשמשת גם
לוולידציה בזמן ריצה וגם כמקור לטיפוסי TypeScript (`z.infer`). אין הגדרה כפולה של טיפוס.
סכמות שנשלחות ל-Gemini כ-`responseSchema` נגזרות מאותה הגדרה דרך `zod-to-json-schema`.

---

## תוכן

1. [`Plan` — סכמת התוכנית](#1-plan--סכמת-התוכנית)
2. [`TaskUnderstanding` — פלט Recon](#2-taskunderstanding--פלט-recon)
3. [חוזה פלט סוכן — NDJSON](#3-חוזה-פלט-סוכן--ndjson)
4. [מעטפת קבצים](#4-מעטפת-קבצים)
5. [פרוטוקול המשכיות](#5-פרוטוקול-המשכיות)
6. [`CheckpointDecision` ותיקון תוכנית](#6-checkpointdecision-ותיקון-תוכנית)
7. [Blackboard](#7-blackboard)
8. [Reducers](#8-reducers)
9. [אירועי Runtime → UI](#9-אירועי-runtime--ui)
10. [רישום סוכן](#10-רישום-סוכן)
11. [`LocalTool`](#11-localtool)

---

## 1. `Plan` — סכמת התוכנית

התוצר של `planner`. מאומת מקומית לפני שמריצים ולו קריאה אחת.

```jsonc
{
  "version": 1,
  "runId": "run_01J...",
  "objective": "ניתוח מאגר הקוד וכתיבת מסמך ארכיטקטורה",
  "deliverables": [
    {
      "id": "d1",
      "kind": "markdown",            // markdown | files | data
      "target": "chat",              // chat | staging | folder
      "acceptance": [
        "מכסה את כל חבילות הליבה",
        "כל טענה מפנה לקובץ ושורה"
      ]
    }
  ],
  "readPolicy": {
    "maxRung": "R4",                 // התקרה בסולם הקריאה (ARCHITECTURE §5.2)
    "fullReadAllowlist": ["src/index.ts"],
    "summarizeIf": { "minRelevance": 0.4, "maxFiles": 60 }
  },
  "stages": [
    {
      "id": "s1",
      "name": "מיפוי מבנה",
      "goal": "לזהות מודולים, גבולות ותלויות",
      "dependsOn": [],
      "agentType": "reader",
      "fanout": {
        "mode": "shard",             // shard | ensemble | debate | pipeline | single
        "count": 6,
        "maxParallel": 3,
        "shardKey": "module"         // איך מחלקים — חייב להיות ניתן לחישוב מקומי
      },
      "inputs": [
        { "from": "artifacts", "select": "repoMap" },
        { "from": "blackboard", "select": "findings[tag=structure]" }
      ],
      "outputContract": {
        "schemaRef": "FindingList",
        "format": "ndjson",
        "maxOutputTokens": 8000
      },
      "contextBudget": { "maxInputTokens": 30000, "cacheContract": true },
      "tokenBudget": { "estimatedIn": 180000, "estimatedOut": 48000, "hardCap": 300000 },
      "mergeStrategy": "local:dedupe-findings",
      "successCriteria": ["לפחות ממצא אחד לכל מודול", "אפס הפרות סכמה"],
      "onFailure": "degrade",        // retry | degrade | replan | skip
      "optional": false
    }
  ],
  "reserve": { "synthesisTokens": 120000, "repairTokens": 60000 }
}
```

**ולידציות מקומיות חובה** (`packages/core/plan/validate.ts`) — כישלון באחת מהן פוסל את התוכנית ומחייב תיקון:

| # | בדיקה |
|---|---|
| V1 | הסכמה תקינה, ה-`dependsOn` מרכיב DAG ללא מעגלים |
| V2 | `Σ stages[].tokenBudget.hardCap + reserve ≤ budget.total` |
| V3 | כל `agentType` קיים ברישום הסוכנים |
| V4 | `maxOutputTokens < MODEL_MAX_OUTPUT` לכל שלב (מרווח ביטחון 10%) |
| V5 | כל `inputs[].from` מפנה לשלב קיים שקודם לו ב-DAG, או למקור סטטי |
| V6 | `fanout.count ≥ 1`, `maxParallel ≥ 1`, ושניהם מתחת לתקרות הגלובליות |
| V7 | לפחות שלב אחד מייצר כל `deliverable` |
| V8 | `readPolicy.maxRung` לא חורג ממה שרמת התקציב מתירה |

## 2. `TaskUnderstanding` — פלט Recon

```jsonc
{
  "intent": "analyze",              // answer | analyze | create | modify | research | convert
  "deliverableShape": {
    "kind": "markdown",
    "estimatedSize": "large",       // small (<5K) | medium (<20K) | large (<100K) | xlarge
    "structure": "sectioned"        // atomic | sectioned | multi-file
  },
  "evidenceNeeds": [
    { "what": "מבנה המאגר", "rung": "R1", "why": "נדרש למיפוי גבולות" },
    { "what": "מימוש שכבת האימות", "rung": "R5", "why": "צריך דיוק ברמת השורה" }
  ],
  "acceptanceCriteria": ["..."],
  "ambiguities": [
    { "question": "האם לכלול את חבילות הבדיקה?", "assumption": "כן", "impact": "medium" }
  ],
  "suggestedRecipe": "repo-analysis",  // או null
  "riskFlags": ["large-input", "write-back-requested"]
}
```

`ambiguities` עם `impact: high` מוצגות למשתמש **לפני** ההרצה. השאר מוצגות כהנחות בתשובה הסופית.

## 3. חוזה פלט סוכן — NDJSON

**למה NDJSON ולא JSON:** אפשר לפרסר תוך כדי סטרימינג, ופלט קטוע נשאר שמיש — זורקים את השורה החלקית
האחרונה וכל מה שלפניה תקף. עם JSON יחיד, קטיעה = אובדן מוחלט. זה בדיוק מה שקורה כשמתקרבים לתקרת 64K.

כל שורה היא אובייקט עם שדה `t` (type):

```jsonc
{"t":"finding","id":"f1","claim":"...","tags":["structure"],"evidence":[{"artifact":"a12","loc":"src/x.ts:40-58"}],"confidence":0.82}
{"t":"note","text":"הערה שלא נכנסת לתוצר"}
{"t":"need","what":"context","query":"מימוש AuthGuard","why":"הממצא לא ניתן לאימות בלי זה"}
{"t":"section","id":"sec-3","title":"...","body":"..."}
{"t":"file_begin","id":"w1","path":"src/a.ts","op":"create","encoding":"utf8"}
{"t":"file_chunk","id":"w1","seq":0,"data":"..."}
{"t":"file_end","id":"w1","sha256":"...","lines":140}
{"t":"done","summary":"...","selfCheck":{"criteriaMet":["c1"],"unmet":[],"confidence":0.9}}
```

**כללי הפרסר** (`packages/core/parse/ndjson.ts`):

1. שורה שלא מתפרסרת כ-JSON → נזרקת, נספרת ב-`schemaViolations`.
2. שורה אחרונה חלקית → נזרקת בשקט (צפוי בקטיעה).
3. אין `{"t":"done"}` → הפלט **חלקי**. אם `finishReason === "MAX_TOKENS"` → פרוטוקול המשכיות (§5).
4. `file_chunk` בלי `file_begin` תואם → נזרק. `file_begin` בלי `file_end` → הקובץ חלקי, מסומן ולא נכתב.
5. `sha256` שלא תואם לתוכן המורכב → הקובץ נדחה. **מגן מפני שרשור שגוי.**
6. `schemaViolations / totalLines > 0.15` → הכשלת ה-Task ופתיחת ניסיון חוזר עם סכמה מוקשחת.

## 4. מעטפת קבצים

הפלט של `file_*` עובר ל-`ArtifactWriter`, שכותב **תמיד ל-staging** ולעולם לא ישירות אל המשתמש.

```jsonc
{
  "path": "src/auth/guard.ts",     // יחסי לשורש. נורמליזציה + חסימת traversal
  "op": "create",                   // create | update | delete | rename
  "encoding": "utf8",               // utf8 | base64 (לבינארי)
  "sha256": "...",
  "sizeBytes": 4210,
  "producedBy": { "stageId": "s3", "taskId": "s3#2" },
  "renameFrom": null
}
```

**כללים:** מסלול מנורמל ונדחה אם יוצא מהשורש · `op:update` דורש שה-`sha256` של המקור תואם למה שהוצג
לסוכן (אחרת: התנגשות → ניסיון חוזר עם הגרסה העדכנית) · שני סוכנים לא יכולים לגעת באותו מסלול באותו
שלב (נאכף בבניית ה-shards, לא בדיעבד) · `op:delete` דורש אישור מפורש תמיד.

## 5. פרוטוקול המשכיות

כשסוכן נחתך בתקרת הפלט:

```
תגובה 1:  ... {"t":"section","id":"sec-7",...}
           {"t":"section","id":"sec-8","title":"רשת","bo   ← קטוע
           finishReason = MAX_TOKENS, אין done
                    ↓
    הפרסר שומר: lastComplete = "sec-7"
                    ↓
    קריאת המשך — אותו Contract Block (מהמטמון, זול):
      "השלמת מעטפת אחרונה: sec-7.
       המשך מ-sec-8. אל תחזור על מה שכבר נשלח."
                    ↓
תגובה 2:  {"t":"section","id":"sec-8",...} ... {"t":"done",...}
                    ↓
         שרשור מקומי לפי סדר השלד
```

**מגבלות:** עד 3 המשכות ל-Task · כל המשכה נספרת מלא ב-`Ledger` · אין התקדמות (אותו `lastComplete`) →
כישלון והקצאה מחדש · **המשכיות היא רשת ביטחון, לא אסטרטגיה** — אם היא קורית תדיר, ה-`outliner` מפצל גס
מדי וזה סימן לתקן את השלד.

## 6. `CheckpointDecision` ותיקון תוכנית

לפני כל שלב רץ **שער מקומי חינמי**. הוא מחשב אותות:

| אות | טריגר |
|---|---|
| `criteriaMissed` | שלב קודם לא עמד ב-`successCriteria` |
| `budgetDrift` | ניצול בפועל חורג מההערכה ביותר מ-25% |
| `emptyOutput` | Task החזיר פחות מסף מינימלי של מעטפות |
| `contradiction` | ב-`ensemble` — חברי הצוות סותרים זה את זה |
| `needsPending` | הצטברו בקשות `need` שלא נענו |
| `schemaViolations` | שיעור הפרות מעל הסף |

**אין אות → ממשיכים בלי לשלם כלום.** יש אות (או שזו נקודת חובה: אחרי recon, אחרי השלב הראשון, לפני
סינתזה) → קריאה זולה עם תקציר מצב של ≤3K טוקנים:

```jsonc
{
  "decision": "amend",               // continue | amend | replan | stop
  "reason": "המודולים גדולים מהצפוי; 6 סוכנים יחרגו מהתקציב",
  "patch": [
    { "op": "replace", "path": "/stages/2/fanout/count", "value": 4 },
    { "op": "replace", "path": "/stages/2/contextBudget/maxInputTokens", "value": 22000 }
  ],
  "confidence": 0.8
}
```

`patch` הוא **RFC 6902 JSON Patch**. פלט קטן, ניתן לביקורת, הפיך — ולא בזבוז של תוכנית שלמה מחדש.

**מסלולים מותרים ל-patch (allowlist):**

| ✅ מותר | ❌ אסור |
|---|---|
| `fanout.count` / `maxParallel` | `budget.total` (רק המשתמש) |
| `contextBudget.*` | הסרה/שינוי של שלב שכבר הסתיים |
| `tokenBudget.hardCap` (רק כלפי מטה, או מ-`repairTokens`) | `reserve.synthesisTokens` כלפי מטה |
| `agentType` (מתוך הרישום) | הוספת `deliverable` חדש |
| הוספה/הסרה של שלב `optional` | כל מסלול שלא ברשימה |

patch שנוגע במסלול אסור נדחה, נרשם, וה-Checkpoint מקבל `continue`. **החלטה של מודל אף פעם לא מרחיבה
את התקציב.** כל גרסת תוכנית נשמרת (`plan.vN.json`) והדיף מוצג ב-UI.

## 7. Blackboard

המצב המשותף בין שלבים. **סוכן אף פעם לא מקבל את כולו** — ה-`ContextBroker` מסנן לפי רלוונטיות ותקציב.

```jsonc
{
  "findings":  [{ "id":"f1","stageId":"s1","claim":"...","tags":[],"evidence":[],"confidence":0.8 }],
  "artifacts": [{ "id":"w1","path":"...","sha256":"...","stageId":"s3" }],
  "decisions": [{ "id":"dec1","text":"נבחר Fastify","rationale":"...","stageId":"s2" }],
  "openQuestions": [{ "id":"q1","text":"...","raisedBy":"s1","resolvedBy":null }],
  "outline": { "id":"o1","sections":[{ "id":"sec-1","title":"...","ownerTaskId":"s4#0","status":"done" }] }
}
```

`findings` עוברים דדופליקציה מקומית: נורמליזציה של הטענה → דמיון לקסיקלי → מיזוג ראיות והחזקת
ה-`confidence` הגבוה. **חינם, וחוסך הזנה חוזרת של אותו מידע לסוכנים הבאים.**

## 8. Reducers

```ts
type Reducer<I, O> = (inputs: TaskResult<I>[], ctx: ReduceContext) => ReduceOutcome<O>;

interface ReduceOutcome<O> {
  value: O;
  gaps: Gap[];              // מה חסר — נכנס לתשובה הסופית
  needsLlmStitch: boolean;  // רק כשאימות מקומי נכשל
  stitchScope?: string[];   // מה בדיוק לתפור — לעולם לא "הכל"
}
```

| מזהה | מה עושה |
|---|---|
| `local:concat-ordered` | שרשור לפי סדר השלד. מוודא שכל הסעיפים קיימים. |
| `local:dedupe-findings` | דדופליקציה ומיזוג ראיות (§7) |
| `local:vote` | ל-`ensemble` — רוב על טענות, סימון מחלוקות כ-`gaps` |
| `local:assemble-files` | כתיבת קבצים ל-staging + הרצת אימות הפרויקט |
| `local:reduce-tree` | מיזוג היררכי לתוצאות רבות |
| `llm:synthesize` | **מוצא אחרון.** נרשם מפורשות ודורש תקציב מ-`reserve` |

**כל reducer שאינו `llm:*` חייב להיות טהור ודטרמיניסטי, ולהיבדק ביחידה ללא רשת.**

## 9. אירועי Runtime → UI

WebSocket, JSON, כל אירוע נושא `runId` ו-`seq` עולה (מאפשר חיבור מחדש והשלמת פערים).

| אירוע | מטען עיקרי |
|---|---|
| `run.started` | `{ runId, budget, mode }` |
| `intake.progress` | `{ filesProcessed, totalFiles, bytesExtracted }` |
| `understanding.ready` | `TaskUnderstanding` |
| `plan.ready` | `{ plan, estimatedTokens, requiresApproval }` |
| `plan.amended` | `{ version, patch, reason, diff }` |
| `stage.started` / `stage.finished` | `{ stageId, taskCount, tokensUsed, criteriaMet }` |
| `task.started` | `{ taskId, agentType, shard, contextTokens }` |
| `task.delta` | `{ taskId, envelope }` — מעטפת NDJSON מפורסרת, לסטרימינג |
| `task.finished` | `{ taskId, usage, finishReason, violations }` |
| `ledger.updated` | `{ spent, committed, remaining, projection, byStage }` |
| `checkpoint.decision` | `CheckpointDecision` |
| `tool.executed` | `{ toolId, script, exitCode, durationMs, outputSize }` |
| `egress.recorded` | `{ callId, bytes, artifactRefs, redactions }` |
| `artifact.produced` | `{ path, sha256, sizeBytes, op }` |
| `run.finished` | `{ status, deliverables, ledger, gaps }` |
| `error` | `{ scope, code, message, recoverable }` |

## 10. רישום סוכן

`agents/<type>/agent.json` + `agents/<type>/agent.md`. **הוספת סוכן = הוספת תיקייה. אפס שינויי קוד.**

```jsonc
{
  "type": "reader",
  "displayName": "קורא",
  "tier": "worker",                    // cheap | worker | synth
  "thinkingLevel": "medium",
  "outputContract": { "schemaRef": "FindingList", "format": "ndjson", "maxOutputTokens": 8000 },
  "contextBudget": { "default": 30000, "max": 60000 },
  "supportsFanout": ["shard", "ensemble"],
  "requiredInputs": ["artifacts"],
  "promptFile": "agent.md",
  "temperature": 0.2
}
```

ה-`agent.md` מקבל משתנים בסוגריים מסולסלים: `{{objective}}`, `{{shard}}`, `{{contract}}`, `{{evidence}}`,
`{{successCriteria}}`, `{{outputSpec}}`. **`{{outputSpec}}` נבנה אוטומטית מהסכמה** — כך שהחוזה בפרומפט לא
יכול להיות לא מסונכרן עם הוולידטור.

## 11. `LocalTool`

```jsonc
{
  "id": "count-symbols",
  "runtime": "python",              // python | node
  "source": "inline",               // inline (נכתב ע"י toolsmith) | registry (מוגדר מראש)
  "script": "...",
  "inputs": { "paths": ["src/**/*.ts"] },
  "limits": { "timeoutMs": 60000, "maxOutputBytes": 262144, "memoryMb": 512, "network": false },
  "expectedOutput": "json"          // json | text | csv
}
```

התוצאה חוזרת כ-`{"t":"tool_result","toolId":"...","ok":true,"data":{...},"truncated":false}`.
פלט שחורג מהתקרה נחתך ומסומן — **הסוכן לא מקבל שקט מטעה על מידע שנעלם.**

---

**המשך:** [`BUDGET.md`](BUDGET.md) · [`UX.md`](UX.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · **[`TASKS.md`](TASKS.md)**
