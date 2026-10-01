/**
 * @date-calendar/core — platform-agnostic calendar logic.
 *
 * Hard rule: nothing in this package may import React, react-dom, or any DOM
 * API. That is what keeps every function here testable on its own, with no
 * renderer and no layout to stand it up in first.
 */
export * from './types.js';
export * from './dates.js';
export * from './layout.js';
export * from './span.js';
export * from './drag.js';
export * from './events.js';
export * from './lists.js';
export * from './memories.js';
export * from './scheduling.js';
export * from './client.js';
