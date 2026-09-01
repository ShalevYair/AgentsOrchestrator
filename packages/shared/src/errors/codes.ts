export const ERROR_CODES = [
  "CONFIG_INVALID",
  "PROVIDER_REQUEST_FAILED",
  "PROVIDER_KEY_INVALID",
  "PROVIDER_RATE_LIMITED",
  "BUDGET_EXCEEDED",
  "BUDGET_RESERVE_LOCKED",
  "SCHEMA_VALIDATION_FAILED",
  "SANDBOX_VIOLATION",
  "SANDBOX_TIMEOUT",
  "PLAN_INVALID",
  "PLAN_PATCH_REJECTED",
  "ARTIFACT_PATH_REJECTED",
  "ARTIFACT_HASH_MISMATCH",
  "NOT_FOUND",
  "TIMEOUT",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Hebrew, user-facing text for every error code. Kept separate from log
 * messages: this is what the UI shows, never the raw exception text.
 */
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  CONFIG_INVALID: "ההגדרות אינן תקינות. בדוק את קובץ הקונפיגורציה ונסה שוב.",
  PROVIDER_REQUEST_FAILED: "הבקשה אל ספק המודל נכשלה. נסה שוב בעוד רגע.",
  PROVIDER_KEY_INVALID: "מפתח ה-API אינו תקין או שפג תוקפו. עדכן אותו בהגדרות.",
  PROVIDER_RATE_LIMITED: "הגעת למגבלת הקצב של הספק. הבקשה תתבצע שוב אוטומטית.",
  BUDGET_EXCEEDED: "התקציב שהוגדר אינו מספיק להמשך ברמה הנוכחית. המערכת מורידה דרגה אוטומטית.",
  BUDGET_RESERVE_LOCKED: "לא ניתן להקצות מהרזרבה השמורה לסינתזה הסופית.",
  SCHEMA_VALIDATION_FAILED: "פלט הסוכן לא תאם לחוזה הצפוי.",
  SANDBOX_VIOLATION: "הסקריפט המקומי ניסה לחרוג מהרשאותיו ונחסם.",
  SANDBOX_TIMEOUT: "הסקריפט המקומי חרג מזמן הריצה המותר ונעצר.",
  PLAN_INVALID: "התוכנית שנבנתה אינה תקינה ודורשת תיקון.",
  PLAN_PATCH_REJECTED: "תיקון התוכנית נדחה כי הוא נגע במסלול שאינו מותר.",
  ARTIFACT_PATH_REJECTED: "נתיב הקובץ נדחה מטעמי בטיחות.",
  ARTIFACT_HASH_MISMATCH: "תוכן הקובץ לא תאם למה שהוצג לסוכן. הקובץ נדחה.",
  NOT_FOUND: "הפריט המבוקש לא נמצא.",
  TIMEOUT: "הפעולה חרגה מזמן הריצה המותר.",
  INTERNAL: "אירעה שגיאה פנימית בלתי צפויה.",
};
