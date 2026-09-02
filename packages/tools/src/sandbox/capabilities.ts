import { spawnSync } from "node:child_process";
import type { SandboxCapabilities } from "./types.js";

/**
 * The exact invocation verified empirically in this environment (see the
 * P7-T1 commit notes in TASKS.md): `unshare --user --net --map-root-user`
 * creates a new user namespace *and* network namespace together, mapping
 * the caller to a virtual root inside it — this is what lets it succeed for
 * a genuinely unprivileged user too, not just for a process already running
 * as root (`--net` alone requires `CAP_NET_ADMIN`, which an unprivileged
 * user doesn't have in the *host* namespace; `--user` is what grants it
 * inside the new one). Verified both as root and as `nobody` via `setpriv`
 * in this container: a process inside the resulting namespace gets
 * `ENETUNREACH` connecting to a real listener on the host's own interface.
 *
 * This requires the kernel to allow unprivileged user namespaces
 * (`kernel.unprivileged_userns_clone`, or the newer unnamed sysctl some
 * hardened distros disable) — so this is *probed*, never assumed.
 */
const UNSHARE_NETNS_ARGS = ["--user", "--net", "--map-root-user", "--", "true"];

export function probeLinuxNetworkNamespace(probe: typeof spawnSync = spawnSync): boolean {
  const result = probe("unshare", UNSHARE_NETNS_ARGS, { timeout: 5000 });
  return !result.error && result.status === 0;
}

/**
 * macOS's Seatbelt (`sandbox-exec` + a deny-network profile) is the
 * zero-native-dependency mechanism for blocking a child's network access —
 * ADR-012 rules out a native addon here. **Not empirically verified**: this
 * session has no macOS machine available, so this probe (and
 * `darwin-sandbox.ts`'s use of it) is implemented against the documented
 * `sandbox-exec` profile syntax but not run for real. A follow-up session
 * with macOS CI access should confirm it actually denies network before
 * trusting `capabilities.networkBlocking` there.
 */
const SANDBOX_EXEC_PROFILE = "(version 1)(allow default)(deny network*)";

export function probeDarwinSandboxExec(probe: typeof spawnSync = spawnSync): boolean {
  const result = probe("sandbox-exec", ["-p", SANDBOX_EXEC_PROFILE, "--", "/usr/bin/true"], {
    timeout: 5000,
  });
  return !result.error && result.status === 0;
}

/**
 * macOS's `ulimit -v` (RLIMIT_AS) does not reliably cap a process's virtual
 * memory — confirmed via web search (not just assumed), see the P7-T1
 * commit notes. CPU time (`ulimit -t`, RLIMIT_CPU) does work. So memory/CPU
 * capping on macOS is honestly reported as "partial", never "full".
 */
export function probeCapabilities(
  platform: NodeJS.Platform,
  probe: typeof spawnSync = spawnSync,
): SandboxCapabilities {
  if (platform === "win32") {
    return {
      platform: "win32",
      implementation: "windows-native",
      timeoutAndProcessTreeKill: true,
      pathJail: true,
      packageAllowlist: true,
      memoryCpuCaps: "partial",
      networkBlocking: false,
      notes: [
        "בידוד חלקי: הסקריפטים יכולים לגשת לרשת. להגנה מלאה התקן Docker Desktop.",
        "תקרת זיכרון/CPU נאכפת בסקר תקופתי (polling) ולא ב-kernel — עלולה לפספס קפיצה מהירה בין דגימות.",
      ],
    };
  }

  if (platform === "darwin") {
    const networkBlocking = probeDarwinSandboxExec(probe);
    return {
      platform: "darwin",
      implementation: "darwin",
      timeoutAndProcessTreeKill: true,
      pathJail: true,
      packageAllowlist: true,
      memoryCpuCaps: "partial",
      networkBlocking,
      notes: [
        "תקרת זיכרון (ulimit -v) לא נאכפת באמינות ב-macOS — רק CPU (ulimit -t) כן.",
        ...(networkBlocking
          ? []
          : ["חסימת רשת (sandbox-exec) לא זמינה בסביבה הזו — בידוד חלקי, כמו Windows ללא Docker."]),
      ],
    };
  }

  // linux (and any other POSIX platform Node reports — treated the same as linux)
  const networkBlocking = probeLinuxNetworkNamespace(probe);
  return {
    platform: "linux",
    implementation: "linux",
    timeoutAndProcessTreeKill: true,
    pathJail: true,
    packageAllowlist: true,
    memoryCpuCaps: "full",
    networkBlocking,
    notes: networkBlocking
      ? []
      : ["חסימת רשת (unshare -n) לא זמינה בסביבה הזו (namespaces לא-פריבילגיים כבויים בקרנל) — בידוד חלקי."],
  };
}
