import { register } from 'node:module';
import { JSDOM } from 'jsdom';

register('./css-hooks.mjs', import.meta.url);

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const { window } = dom;

function copyProp(key: string) {
  if (key in globalThis) return;
  const value = (window as unknown as Record<string, unknown>)[key];
  try {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  } catch {
    // Some browser globals are non-configurable on globalThis.
  }
}

// Ensure window/document are the jsdom ones before copying other props.
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  writable: true,
  value: window,
});
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  writable: true,
  value: window.document,
});

copyProp('navigator');
copyProp('HTMLElement');
copyProp('HTMLButtonElement');
copyProp('HTMLInputElement');
copyProp('HTMLFormElement');
copyProp('HTMLDivElement');
copyProp('Node');
copyProp('NodeFilter');
copyProp('TreeWalker');
copyProp('Element');
copyProp('DocumentFragment');
copyProp('MutationObserver');
copyProp('getComputedStyle');
copyProp('requestAnimationFrame');
copyProp('cancelAnimationFrame');
// Force jsdom event constructors over Node's built-ins (Radix dispatchEvent
// rejects cross-realm Event instances).
for (const key of [
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'FocusEvent',
] as const) {
  const value = (window as unknown as Record<string, unknown>)[key];
  if (value != null) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
}

if (typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.ResizeObserver;
}
copyProp('ResizeObserver');

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
}
copyProp('matchMedia');

// Radix Dialog / focus-trap expect these on Element (missing in jsdom).
const elementProto = window.Element.prototype as Element & {
  hasPointerCapture?: (pointerId: number) => boolean;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
  scrollIntoView?: () => void;
};
elementProto.hasPointerCapture ??= () => false;
elementProto.setPointerCapture ??= () => {};
elementProto.releasePointerCapture ??= () => {};
elementProto.scrollIntoView ??= () => {};
