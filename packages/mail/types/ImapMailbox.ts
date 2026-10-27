/**
 * One line of a LIST reply. `name` is decoded from modified UTF-7;
 * `attributes` keep the server's spelling (`\HasNoChildren`, `\Noselect`,
 * `\Trash`, …).
 */
export type ImapMailbox = {
  name: string;
  /** Hierarchy delimiter, absent when the server reports NIL. */
  delimiter?: string;
  attributes: string[];
};
