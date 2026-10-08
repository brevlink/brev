import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

const cn = (...classes) => classes.filter(Boolean).join(' ');

export function Button({
  as: Tag = 'button',
  variant = 'secondary',
  size = 'default',
  className,
  type,
  ...props
}) {
  const variants = {
    primary: 'border-control bg-ink text-surface shadow-action hover:bg-ink-muted',
    secondary:
      'border-control bg-surface-raised text-ink hover:bg-surface-solid hover:border-ink-muted',
    danger: 'border-danger bg-surface-raised text-danger hover:bg-danger/10',
    ghost:
      'border-transparent bg-transparent text-ink-muted hover:bg-accent/30 hover:text-ink',
  };
  const sizes = {
    default: 'min-h-11 px-5 text-sm',
    sm: 'min-h-11 px-3.5 text-xs',
    icon: 'size-11 shrink-0 p-0 text-xl',
  };
  return (
    <Tag
      data-slot="button"
      type={Tag === 'button' ? type || 'button' : type}
      className={cn(
        'inline-flex self-start cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-pill border font-extrabold transition-colors duration-(--duration-interaction) active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ as: Tag = 'input', autoFocus, className, ...props }) {
  return (
    <Tag
      data-slot="input"
      autoFocus={autoFocus}
      data-autofocus={autoFocus ? true : undefined}
      className={cn(
        'min-h-12 w-full min-w-0 rounded-control border border-control bg-surface-solid/65 px-4 text-ink transition-colors focus:border-ink disabled:opacity-60 aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}
export function Label({ as: Tag = 'label', className, ...props }) {
  return (
    <Tag
      data-slot="label"
      className={cn('text-sm font-extrabold text-ink-muted', className)}
      {...props}
    />
  );
}
export function Field({ as: Tag = 'div', className, ...props }) {
  return (
    <Tag
      data-slot="field"
      className={cn('grid min-w-0 gap-2', className)}
      {...props}
    />
  );
}
export function FieldError({ id, className, ...props }) {
  return (
    <p
      data-slot="field-error"
      id={id}
      role="alert"
      className={cn('m-0 text-sm text-danger', className)}
      {...props}
    />
  );
}
export function FormStack({ className, ...props }) {
  return (
    <form
      data-slot="form-stack"
      className={cn('mt-7 grid gap-5', className)}
      {...props}
    />
  );
}
export function InlineForm({ className, ...props }) {
  return (
    <form
      data-slot="inline-form"
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 max-[840px]:grid-cols-1',
        className,
      )}
      {...props}
    />
  );
}
export function Panel({ as: Tag = 'section', className, ...props }) {
  return (
    <Tag
      data-slot="panel"
      className={cn(
        'grid min-w-0 gap-5 rounded-panel border border-line bg-surface-raised p-6 max-[520px]:p-4',
        className,
      )}
      {...props}
    />
  );
}
export function Card({ className, ...props }) {
  return (
    <Panel
      data-slot="card"
      className={cn('shadow-panel', className)}
      {...props}
    />
  );
}
export function AuthCard({ className, ...props }) {
  return (
    <Card
      data-slot="auth-card"
      className={cn('w-full max-w-[440px] bg-surface-solid/60 p-8', className)}
      {...props}
    />
  );
}
export function DataList({ className, ...props }) {
  return (
    <div
      data-slot="data-list"
      className={cn('grid min-w-0 gap-3', className)}
      {...props}
    />
  );
}
export function DataRow({
  as: Tag = 'article',
  stacked = false,
  className,
  ...props
}) {
  return (
    <Tag
      data-slot="data-row"
      className={cn(
        'grid min-w-0 gap-4 rounded-row border border-line bg-surface-raised p-4',
        stacked
          ? 'grid-cols-1'
          : 'grid-cols-[minmax(0,1fr)_auto] max-[840px]:grid-cols-1',
        className,
      )}
      {...props}
    />
  );
}
export function DataTitle({ as: Tag = 'strong', className, ...props }) {
  return (
    <Tag
      data-slot="data-title"
      className={cn(
        'mb-1.5 block font-extrabold [overflow-wrap:anywhere]',
        className,
      )}
      {...props}
    />
  );
}
export function DataText({ as: Tag = 'p', className, ...props }) {
  return (
    <Tag
      data-slot="data-text"
      className={cn(
        'mt-1 mb-0 text-sm text-ink-muted [overflow-wrap:anywhere]',
        className,
      )}
      {...props}
    />
  );
}
export function RowActions({ align = 'end', className, ...props }) {
  return (
    <div
      data-slot="row-actions"
      className={cn(
        'flex min-w-0 flex-wrap content-start gap-2',
        align === 'start'
          ? 'justify-start'
          : 'justify-end max-[840px]:justify-start',
        className,
      )}
      {...props}
    />
  );
}
export function StatusBadge({
  as: Tag = 'span',
  tone = 'neutral',
  className,
  ...props
}) {
  return (
    <Tag
      data-slot="status-badge"
      className={cn(
        'inline-flex min-h-9 max-w-full shrink-0 items-center rounded-pill border border-line px-3 text-xs font-extrabold',
        Tag === 'p' ? 'whitespace-normal' : 'whitespace-nowrap',
        tone === 'success' ? 'text-success' : 'text-ink-muted',
        className,
      )}
      {...props}
    />
  );
}
// Unpredictable titles have an operable disclosure, also available on touch and keyboard.
export function TitleBadge({ children, className, ...props }) {
  return (
    <details
      data-slot="title-badge"
      className={cn('mt-3 min-w-0 max-w-full', className)}
      {...props}
    >
      <summary
        aria-label={`Show full title: ${children}`}
        className="w-fit max-w-full cursor-pointer rounded-pill border border-control px-3 py-2 text-sm text-ink-muted"
      >
        <span className="inline-block max-w-[min(60vw,28rem)] align-middle truncate">
          {children}
        </span>
      </summary>
      <DataText className="py-2">{children}</DataText>
    </details>
  );
}
export function Alert({ as: Tag = 'div', className, ...props }) {
  return (
    <Tag
      data-slot="alert"
      role="alert"
      className={cn(
        'rounded-control border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger',
        className,
      )}
      {...props}
    />
  );
}
export function EmptyState({ title, children, action, className, ...props }) {
  return (
    <Panel
      data-slot="empty-state"
      className={cn('justify-items-center py-12 text-center', className)}
      {...props}
    >
      <PanelTitle>{title}</PanelTitle>
      <Muted>{children}</Muted>
      {action}
    </Panel>
  );
}
export function Eyebrow({ className, ...props }) {
  return (
    <p
      data-slot="eyebrow"
      className={cn(
        'mt-0 mb-3 text-xs font-extrabold uppercase tracking-[0.18em] text-ink-muted',
        className,
      )}
      {...props}
    />
  );
}
export function Muted({ as: Tag = 'p', className, ...props }) {
  return (
    <Tag
      data-slot="muted"
      className={cn('text-ink-muted leading-relaxed', className)}
      {...props}
    />
  );
}
export function PanelTitle({ as: Tag = 'h2', className, ...props }) {
  return (
    <Tag
      data-slot="panel-title"
      className={cn(
        'm-0 font-display text-[clamp(2rem,2.4vw,3rem)] leading-none',
        className,
      )}
      {...props}
    />
  );
}
export function PanelHead({ className, ...props }) {
  return (
    <div
      data-slot="panel-head"
      className={cn(
        'flex flex-wrap items-start justify-between gap-4',
        className,
      )}
      {...props}
    />
  );
}
export function PageHeader({
  title,
  eyebrow = 'Workspace',
  description,
  action,
  className,
  ...props
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        'mb-8 flex items-end justify-between gap-6 max-[520px]:flex-col max-[520px]:items-stretch',
        className,
      )}
      {...props}
    >
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="m-0 font-display text-[clamp(2.5rem,4vw,4rem)] leading-none">
          {title}
        </h1>
        {description && <Muted className="mb-0 mt-3">{description}</Muted>}
      </div>
      {action}
    </header>
  );
}
export function Brand({ className, ...props }) {
  return (
    <a
      data-slot="brand"
      className={cn(
        'inline-flex items-center gap-3 font-extrabold tracking-[0.02em]',
        className,
      )}
      {...props}
    />
  );
}
export function NavTabs({
  items,
  onNavigate,
  vertical = false,
  className,
  ...props
}) {
  return (
    <nav
      data-slot="nav-tabs"
      className={cn(
        vertical ? 'grid gap-2' : 'flex flex-wrap gap-2',
        className,
      )}
      {...props}
    >
      {items.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center rounded-pill border px-4 text-sm font-extrabold transition-colors duration-(--duration-navigation)',
              isActive
                ? 'border-control bg-ink text-surface'
                : 'border-transparent text-ink-muted hover:border-control hover:bg-surface-solid',
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
export function ResultCard({ className, ...props }) {
  return (
    <Panel
      as="div"
      data-slot="result-card"
      className={cn('mt-6 gap-2 bg-accent/20', className)}
      {...props}
    />
  );
}
export function Dialog({
  open,
  onDismiss,
  onKeyDown,
  ref,
  className,
  children,
  ...props
}) {
  const localRef = useRef(null);
  const dialogRef = ref || localRef;
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = open ? document.activeElement : null;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open, dialogRef]);
  return (
    <dialog
      ref={dialogRef}
      data-slot="dialog"
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])',
          ),
        ].filter(
          (element) =>
            element.tabIndex >= 0 && element.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss?.();
      }}
      className={cn(
        'fixed inset-0 m-auto max-h-[calc(100dvh-32px)] w-[min(calc(100%-32px),560px)] overflow-y-auto overscroll-contain rounded-panel border border-line bg-surface-solid p-7 text-ink shadow-dialog backdrop:bg-ink/35 backdrop:backdrop-blur-sm max-[520px]:p-4',
        className,
      )}
      {...props}
    >
      {children}
    </dialog>
  );
}

export function DetailPanel({ className, ...props }) {
  return (
    <Panel
      as="div"
      data-slot="detail-panel"
      className={cn('gap-3 rounded-row p-4', className)}
      {...props}
    />
  );
}
export function DnsRecord({ className, ...props }) {
  return (
    <Panel
      data-slot="dns-record"
      className={cn('gap-3 rounded-control bg-surface/70 p-3', className)}
      {...props}
    />
  );
}
export function DnsValue({ className, ...props }) {
  return (
    <dd
      data-slot="dns-value"
      className={cn(
        'm-0 max-w-full min-w-0 overflow-x-auto whitespace-nowrap rounded-control border border-line bg-surface-solid/65 px-3 py-2 font-mono text-sm text-ink',
        className,
      )}
      {...props}
    />
  );
}
export function MonoValue({ as: Tag = 'span', className, ...props }) {
  return (
    <Tag
      data-slot="mono-value"
      className={cn(
        'font-mono text-ink-muted [overflow-wrap:anywhere]',
        className,
      )}
      {...props}
    />
  );
}
export function OptionButton({ selected, className, ...props }) {
  return (
    <button
      type="button"
      data-slot="option-button"
      className={cn(
        'flex min-h-11 w-full cursor-pointer items-center rounded-control px-3 py-2 text-left font-semibold',
        selected ? 'bg-ink text-surface' : 'text-ink hover:bg-accent/35',
        className,
      )}
      {...props}
    />
  );
}

export function FieldInput({
  id,
  label,
  error,
  hint,
  className,
  onChange,
  onInvalid,
  'aria-describedby': describedBy,
  ...props
}) {
  const [nativeError, setNativeError] = useState('');
  const message = error || nativeError;
  const description =
    cn(describedBy, hint && `${id}-hint`, message && `${id}-error`) ||
    undefined;
  return (
    <Field data-slot="field-input" className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={message ? true : undefined}
        aria-describedby={description}
        onInvalid={(event) => {
          setNativeError(event.currentTarget.validationMessage);
          onInvalid?.(event);
        }}
        onChange={(event) => {
          setNativeError('');
          onChange?.(event);
        }}
        {...props}
      />
      {hint && (
        <Muted id={`${id}-hint`} className="m-0 text-sm">
          {hint}
        </Muted>
      )}
      {message && <FieldError id={`${id}-error`}>{message}</FieldError>}
    </Field>
  );
}

export function AuthPage({ className, ...props }) {
  return (
    <main
      data-slot="auth-page"
      className={cn('grid min-h-screen place-items-center p-6', className)}
      {...props}
    />
  );
}
export function AuthFooter({ className, ...props }) {
  return (
    <p
      data-slot="auth-footer"
      className={cn(
        'mt-6 text-center text-ink-muted [&_a]:font-extrabold [&_a]:text-ink',
        className,
      )}
      {...props}
    />
  );
}
export function BrandLogo({ className, ...props }) {
  return (
    <img
      data-slot="brand-logo"
      className={cn('size-11 shrink-0 object-contain', className)}
      {...props}
    />
  );
}
export function Note({ className, ...props }) {
  return (
    <p
      data-slot="note"
      className={cn('m-0 text-sm text-ink-muted', className)}
      {...props}
    />
  );
}
export function DnsEntry({ className, ...props }) {
  return (
    <div
      data-slot="dns-entry"
      className={cn('grid min-w-0 items-start gap-1', className)}
      {...props}
    />
  );
}
export function DnsTitle({ className, ...props }) {
  return (
    <h3
      data-slot="dns-title"
      className={cn('m-0 text-sm font-extrabold text-ink', className)}
      {...props}
    />
  );
}
