import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setElephantRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getElephantRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Elephant runtime not initialized");
  }
  return runtime;
}
