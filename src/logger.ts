/**
 * Lightweight manual logger to replace the 'debug' package.
 * Supports namespace filtering via the DEBUG environment variable.
 */

export type Logger = (message: string, ...args: any[]) => void;

/**
 * Creates a namespaced logger.
 * @param namespace The namespace for this logger (e.g., 'xypriss:compression').
 * @returns A logger function.
 */
export function createLogger(namespace: string): Logger {
  const isEnabled = checkEnabled(namespace);

  return (message: string, ...args: any[]) => {
    if (!isEnabled) return;

    const timestamp = new Date().toISOString();
    let formattedMessage = message;

    // Basic support for %s, %o, %v etc. manually
    args.forEach((arg) => {
      const value = typeof arg === "object" ? JSON.stringify(arg) : String(arg);
      if (formattedMessage.includes("%")) {
        formattedMessage = formattedMessage.replace(/%[sovdj%]/, value);
      } else {
        formattedMessage += ` ${value}`;
      }
    });

    console.error(`[${timestamp}] [${namespace}] ${formattedMessage}`);
  };
}

/**
 * Checks if a namespace is enabled for debugging.
 * Supports basic globbing (e.g., 'xypriss:*').
 */
function checkEnabled(namespace: string): boolean {
  const debugEnv = process.env.DEBUG || "";
  if (!debugEnv) return false;

  const patterns = debugEnv.split(/[\s,]+/).filter(Boolean);

  for (const pattern of patterns) {
    let isNegated = false;
    let actualPattern = pattern;

    if (pattern.startsWith("-")) {
      isNegated = true;
      actualPattern = pattern.slice(1);
    }

    const regexPattern = actualPattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");

    const regex = new RegExp(`^${regexPattern}$`);

    if (regex.test(namespace)) {
      return !isNegated;
    }
  }

  return false;
}
