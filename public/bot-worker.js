// ربات در یک رشته‌ی جدا فکر می‌کند تا صفحه گیر نکند.
import { chooseMove } from "./bot-engine.js";

self.onmessage = (e) => {
  const { id, botId, sans, lite } = e.data;
  try {
    self.postMessage({ id, move: chooseMove(botId, sans, Math.random, { lite }) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
