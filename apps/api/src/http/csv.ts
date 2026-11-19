/**
 * One CSV cell. Quoted always, quotes doubled. A cell that starts with = + - @ (or a tab or return) would be
 * run as a formula by a spreadsheet, so it gets a leading apostrophe: names and notes are user input.
 */
export const csvCell = (value: unknown): string => {
  let v = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
};
