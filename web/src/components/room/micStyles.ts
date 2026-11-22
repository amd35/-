/** Mic seat designs an admin can pick per room — all transparent, no solid box. */
export const MIC_STYLES = [
  { id: 'fire', label: 'ناري' },
  { id: 'glass', label: 'زجاج شفاف' },
  { id: 'crystal', label: 'كريستال' },
  { id: 'neon', label: 'نيون' },
  { id: 'gold', label: 'ذهبي' },
  { id: 'ice', label: 'ثلجي' },
] as const;

export const MIC_COLORS = [
  '#ff3b0f',
  '#ff2d95',
  '#8b5cf6',
  '#22d3ee',
  '#ffd24a',
  '#34d399',
  '#ffffff',
] as const;
