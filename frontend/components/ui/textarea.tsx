import { forwardRef, type TextareaHTMLAttributes } from "react";

type AppTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  description?: string;
  error?: string;
};

export const AppTextarea = forwardRef<HTMLTextAreaElement, AppTextareaProps>(
  function AppTextarea({ label, description, error, className = "", id, ...props }, ref) {
    const controlId = id || `textarea-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const descriptionId = description || error ? `${controlId}-description` : undefined;
    return (
      <div className={`app-textarea ${className}`}>
        <label htmlFor={controlId}>{label}</label>
        <textarea
          ref={ref}
          id={controlId}
          className="app-textarea__control"
          aria-describedby={descriptionId}
          aria-invalid={Boolean(error)}
          {...props}
        />
        {error ? <p id={descriptionId} role="alert" className="app-textarea__error">{error}</p> : description ? <p id={descriptionId} className="app-textarea__description">{description}</p> : null}
      </div>
    );
  },
);
