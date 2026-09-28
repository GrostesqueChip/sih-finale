import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import useModalA11y from '../../hooks/useModalA11y';

export default function ConfirmDialog({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  const { containerRef, dialogProps } = useModalA11y(isOpen, onCancel);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-none"
      onMouseDown={(e) => {
        // Backdrop click (not a drag ending inside) cancels.
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div
        ref={containerRef}
        {...dialogProps}
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="bg-white rounded-lg border border-slate-200 shadow-sm max-w-md w-full p-6 space-y-4 focus:outline-none"
      >
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-full shrink-0 ${
              isDanger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            <FiAlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900">{title}</h3>
            <p id="confirm-dialog-message" className="text-sm text-slate-600 mt-1">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
