import { useEffect, useRef } from 'react';

/**
 * Accessibility helper for modal dialogs. When `isOpen` is true it:
 *  - closes the dialog on Escape,
 *  - traps Tab focus inside the dialog,
 *  - moves initial focus into the dialog and restores it to the previously
 *    focused element on close,
 *  - locks background scroll.
 *
 * Returns a ref to attach to the dialog container. Spread `dialogProps` (or set
 * role="dialog" aria-modal="true" yourself) on that same container.
 *
 * @param {boolean} isOpen  Whether the modal is currently shown.
 * @param {() => void} onClose  Called when the user presses Escape.
 */
export default function useModalA11y(isOpen, onClose) {
  const containerRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocused.current = document.activeElement;

    const container = containerRef.current;
    const focusable = () =>
      container
        ? Array.from(
            container.querySelectorAll(
              'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null)
        : [];

    // Move initial focus into the dialog.
    const initial = focusable();
    if (initial.length > 0) {
      initial[0].focus();
    } else if (container) {
      container.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === 'Tab') {
        const items = focusable();
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = prevOverflow;
      // Restore focus to whatever was focused before the modal opened.
      const toRestore = previouslyFocused.current;
      if (toRestore && typeof toRestore.focus === 'function') {
        toRestore.focus();
      }
    };
  }, [isOpen, onClose]);

  return { containerRef, dialogProps: { role: 'dialog', 'aria-modal': 'true', tabIndex: -1 } };
}
