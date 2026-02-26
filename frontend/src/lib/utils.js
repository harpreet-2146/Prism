// frontend/src/lib/utils.js
// Utility helpers for the PRISM frontend

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ── Tailwind class merging ────────────────────────────────────────────────────
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ── groupBy ───────────────────────────────────────────────────────────────────
// Accepts either a string key name OR a callback function.
//
//   groupBy(items, 'category')             → groups by item.category
//   groupBy(items, item => item.category)  → groups using callback result
//
// Returns: { [groupKey: string]: T[] }
export function groupBy(array, keyOrFn) {
  if (!Array.isArray(array)) return {};

  const getKey = typeof keyOrFn === 'function'
    ? keyOrFn
    : (item) => item[keyOrFn];

  return array.reduce((acc, item) => {
    const key = String(getKey(item) ?? 'Other');
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

// ── Date formatting ───────────────────────────────────────────────────────────
// Returns a human-readable group label: "Today", "Yesterday", "Mon Feb 24", etc.
export function formatChatDate(dateInput) {
  if (!dateInput) return 'Older';

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Older';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - itemDay) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  if (diffDays < 30) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Alias used in some components
export const formatDate = formatChatDate;

// ── Text helpers ──────────────────────────────────────────────────────────────
export function truncate(str, maxLen = 40) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ── Misc ──────────────────────────────────────────────────────────────────────
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}
