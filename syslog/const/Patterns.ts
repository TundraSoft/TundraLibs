export const Patterns = {
  // "RFC3164":
  //   /^<(\d+)?>([Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec]+\s\d{1,2}\s\d+:\d+:\d+)\s*([^\s]+)\s*(([a-z0-9]+)?(\[\d+\])?)\:\s*(.+)$/i,
  // "RFC3164": /(<(\d+)?>)(([Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec]+)\s*(\d{1,2})?\s*(\d{4}\s*)?(\d+:\d+:\d+)?\s)?\s*([^\s\:]+)?\s*(([^\s\:\[]+)?(\[(\d+)\])?)?:(.+)/i,
  'RFC3164':
    /(<(\d+)?>)(([Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec]+)?\s*(\d{1,2})\s*(\d{4})?\s*(\d{1,2}:\d{1,2}:\d{1,2}))?\s*([^\s\:]+)?\s*(([^\s\:\[]+)?(\[(\d+)\])?)?:(.+)/i,
  'RFC5424':
    /^<(\d+)?>\d (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\S+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*/i,
  'STRUCT': /\[[^\]]+\]\s*/g,
  'STRUCTID': /\[((\w+)@(\d+))\s*/,
  'STRUCTKEYS': /([\w.-]+)\s*=\s*(["'])((?:(?=(\\?))\3.)*?)\2/,
};
