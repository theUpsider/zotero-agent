/** Bundle entry point. esbuild wraps this as an IIFE assigned to the global
 * `ZoteroAgent` variable that addon/bootstrap.js declares and drives. */

import { ZoteroAgentPlugin } from "./plugin";

const plugin = new ZoteroAgentPlugin();

export function init(info: { id: string; version: string; rootURI: string }): void {
  plugin.init(info);
}

export function addToWindow(window: _ZoteroTypes.MainWindow): void {
  plugin.addToWindow(window);
}

export function addToAllWindows(): void {
  plugin.addToAllWindows();
}

export function removeFromWindow(window: _ZoteroTypes.MainWindow): void {
  plugin.removeFromWindow(window);
}

export function removeFromAllWindows(): void {
  plugin.removeFromAllWindows();
}
