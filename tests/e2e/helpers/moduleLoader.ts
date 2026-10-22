/**
 * Safe Module Loader for Progressive & Opaque-Box Testing
 * Allows test suites to verify module availability, interface contract adherence, and export signatures.
 */

import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";

export async function safeImport<T = any>(modulePath: string): Promise<{ module: T | null; error?: string }> {
  try {
    let resolved = modulePath;
    if (modulePath.startsWith("@/")) {
      resolved = path.resolve(process.cwd(), modulePath.replace(/^@\//, "src/"));
    }
    const fileUrl = pathToFileURL(resolved).href;
    const mod = await import(fileUrl);
    return { module: mod };
  } catch (err: any) {
    return {
      module: null,
      error: err?.message || String(err),
    };
  }
}

export function checkFileExists(relativeOrAbsPath: string): boolean {
  try {
    const fullPath = path.isAbsolute(relativeOrAbsPath)
      ? relativeOrAbsPath
      : path.join(process.cwd(), relativeOrAbsPath);
    return fs.existsSync(fullPath);
  } catch {
    return false;
  }
}

export function readSourceFile(relativeOrAbsPath: string): string {
  const fullPath = path.isAbsolute(relativeOrAbsPath)
    ? relativeOrAbsPath
    : path.join(process.cwd(), relativeOrAbsPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File does not exist: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, "utf-8");
}
