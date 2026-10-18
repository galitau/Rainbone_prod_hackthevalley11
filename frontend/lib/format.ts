// "17.7", "60,819": fixed decimals with thousands separators, the same on the server and in the browser.
export const formatNumber = (value: number, digits: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
