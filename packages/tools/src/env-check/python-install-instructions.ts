/**
 * P12-T2's explicit failure mode to avoid: telling a Windows user to run
 * `apt install python3`. Each platform gets its own real instructions
 * instead of one generic message copy-pasted across platforms.
 */
export function pythonInstallInstructions(platform: NodeJS.Platform): string {
  if (platform === "win32") {
    return (
      "התקינו Python מ-https://www.python.org/downloads/windows/ — בתהליך ההתקנה סמנו " +
      '"Add python.exe to PATH". (לא apt/yum — אלה לא קיימים ב-Windows.)'
    );
  }
  if (platform === "darwin") {
    return "התקינו Python מ-https://www.python.org/downloads/macos/ , או עם Homebrew: brew install python3";
  }
  return (
    "התקינו Python דרך מנהל החבילות של ההפצה, למשל sudo apt install python3 (Debian/Ubuntu) " +
    "או sudo dnf install python3 (Fedora), או מ-https://www.python.org/downloads/source/"
  );
}
