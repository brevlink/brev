export const colors = {
  navy: '#071936',
  navyMuted: '#38516f',
  beige: '#efe6d4',
  beigeSoft: '#f8f1e6',
  danger: '#b42318',
};

export const serif = "font-['Instrument_Serif',Georgia,serif]";

export const brand = 'inline-flex items-center gap-3 font-extrabold tracking-[0.02em]';

export const buttonBase =
  'inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border border-[#071936] px-5 font-extrabold text-[#071936] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 max-[520px]:w-full';

export const button = {
  primary: `${buttonBase} bg-[#071936] text-[#f8f1e6] shadow-[0_18px_36px_rgba(7,25,54,0.2)]`,
  secondary: `${buttonBase} bg-[rgba(255,250,241,0.48)]`,
  danger: `${buttonBase} border-[rgba(180,35,24,0.4)] bg-[rgba(255,250,241,0.4)] text-[#b42318]`,
  compactSecondary: `${buttonBase} min-h-[34px] px-3.5 text-[0.82rem] bg-[rgba(255,250,241,0.48)]`,
  compactDanger: `${buttonBase} min-h-[34px] px-3.5 text-[0.82rem] border-[rgba(180,35,24,0.4)] bg-[rgba(255,250,241,0.4)] text-[#b42318]`,
  fullPrimary: `${buttonBase} w-full bg-[#071936] text-[#f8f1e6] shadow-[0_18px_36px_rgba(7,25,54,0.2)]`,
};

export const textButton = 'cursor-pointer border-0 bg-transparent font-extrabold text-[#38516f]';

export const iconButton =
  'grid size-[38px] cursor-pointer place-items-center rounded-full border border-[rgba(7,25,54,0.14)] bg-transparent text-[1.35rem] text-[#071936]';

export const eyebrow =
  'mb-3 mt-0 text-[0.78rem] font-extrabold uppercase tracking-[0.18em] text-[#38516f]';

export const muted = 'text-[#38516f] leading-[1.65]';

export const input =
  'min-h-12 w-full rounded-2xl border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.64)] px-4 text-[#071936] outline-none focus:border-[#071936] focus:shadow-[0_0_0_3px_rgba(7,25,54,0.1)]';

export const alert =
  'rounded-2xl border border-[rgba(180,35,24,0.22)] bg-[rgba(180,35,24,0.08)] px-3.5 py-3 text-sm text-[#b42318]';

export const field = 'grid gap-2';
export const fieldLabel = 'text-[0.88rem] font-extrabold text-[#38516f]';
export const formStack = 'mt-7 grid gap-[18px]';

export const panel =
  'grid min-w-0 gap-[18px] rounded-[28px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.38)] p-6 max-[520px]:rounded-[22px] max-[520px]:p-[18px]';

export const panelTitle = `${serif} m-0 text-[clamp(2rem,2.4vw,3rem)] leading-[0.9] max-[520px]:text-[2.15rem]`;

export const panelHeadSplit = 'flex items-start justify-between gap-4';

export const inlineForm = 'grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 max-[840px]:grid-cols-1 max-[520px]:gap-2';

export const dataList = 'grid min-w-0 gap-2.5';

export const dataRow =
  'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3.5 rounded-[18px] border border-[rgba(7,25,54,0.14)] bg-[rgba(255,250,241,0.38)] p-3.5 max-[840px]:grid-cols-1';

export const compactRow = `${dataRow} grid-cols-[minmax(0,1fr)_auto]`;

export const dataTitle = 'mb-1.5 block [overflow-wrap:anywhere] font-extrabold';

export const dataText = 'mt-1 mb-0 [overflow-wrap:anywhere] text-[0.84rem] text-[#38516f]';

export const rowActions = 'flex min-w-0 flex-wrap content-start justify-end gap-2 max-[840px]:justify-start';

export const rowActionsLeft = 'flex min-w-0 flex-wrap content-start justify-start gap-2';

export const statusBase =
  'inline-flex min-h-[34px] items-center rounded-full border border-[rgba(7,25,54,0.14)] px-3 text-[0.8rem] font-extrabold text-[#38516f] max-[520px]:w-full max-[520px]:justify-center';

export const status = {
  base: statusBase,
  good: `${statusBase} text-[#17683a]`,
};

export const srOnly =
  'absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]';
