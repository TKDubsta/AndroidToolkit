// Ambient declarations for the vendored global libraries loaded by <script>
// tags in src/UI/index.html. jQuery ($) is typed via @types/jquery. Only the
// surface the renderer touches is declared.

interface BootstrapComponent {
  show(): void;
  hide(): void;
  toggle(): void;
  dispose(): void;
}

interface BootstrapComponentConstructor {
  new (element: Element | null, options?: Record<string, unknown>): BootstrapComponent;
  getInstance(element: Element | null): BootstrapComponent | null;
  getOrCreateInstance(
    element: Element | null,
    options?: Record<string, unknown>
  ): BootstrapComponent;
}

declare const bootstrap: {
  Modal: BootstrapComponentConstructor;
  Dropdown: BootstrapComponentConstructor;
  Tooltip: BootstrapComponentConstructor;
};

// Bootstrap's jQuery plugin bridge (not covered by @types/jquery).
interface JQuery<TElement = HTMLElement> {
  modal(action?: unknown): JQuery<TElement>;
  dropdown(action?: unknown): JQuery<TElement>;
}
