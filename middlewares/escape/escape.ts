export class Escape {
  static matchEscHtmlRx = /["'<>\;]/;
  static matchUnEscRx = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34);/g;
  // deno-lint-ignore no-control-regex
  static matchEscSqlRx = /[\0\b\t\n\r\x1a"'\\]/g;

  static isEscape(str: string): boolean {
    const removeUnEscStr = str.replace(Escape.matchUnEscRx, '');
    const matchEscHtml = Escape.matchEscHtmlRx.exec(removeUnEscStr);

    if (!matchEscHtml) {
      return false;
    }

    return true;
  }

  static escapeHtml(str: string): string {
    const matchEscHtml = Escape.matchEscHtmlRx.exec(str);
    if (!matchEscHtml) {
      return str;
    }
    let escape: string;
    let html = '';
    let index = 0;
    let lastIndex = 0;
    for (index = matchEscHtml.index; index < str.length; index++) {
      switch (str.charCodeAt(index)) {
        case 34: // "
          escape = '&quot;';
          break;
        case 38: // &
          escape = '&amp;';
          break;
        case 39: // '
          escape = '&#39;';
          break;
        case 60: // <
          escape = '&lt;';
          break;
        case 62: // >
          escape = '&gt;';
          break;
        default:
          continue;
      }

      if (lastIndex !== index) {
        html += str.substring(lastIndex, index);
      }

      lastIndex = index + 1;
      html += escape;
    }

    return lastIndex !== index ? html + str.substring(lastIndex, index) : html;
  }

  static isUnescape(str: string): boolean {
    const matchUnEsc = Escape.matchUnEscRx.exec(str);
    if (!matchUnEsc) {
      return false;
    }

    return true;
  }

  static unescapeHtml(str: string): string {
    const matchUnEsc = Escape.matchUnEscRx.exec(str);
    if (!matchUnEsc) {
      return str;
    }

    const res = str.replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x3A;/g, ':')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    return Escape.unescapeHtml(res);
  }

  static escapeSql(sqlStr: string): string {
    const matchEscSqlRx = Escape.matchEscSqlRx;
    let chunkIndex = 0;
    let escapedSqlStr = '';
    let matchChar: RegExpExecArray | null;

    while ((matchChar = matchEscSqlRx.exec(sqlStr)) !== null) {
      switch (matchChar[0]) {
        case '\0':
          escapedSqlStr += '\\0';
          break;
        case '\x08':
          escapedSqlStr += '\\b';
          break;
        case '\x09':
          escapedSqlStr += '\\t';
          break;
        case '\x1a':
          escapedSqlStr += '\\z';
          break;
        case '\n':
          escapedSqlStr += '\\n';
          break;
        case '\r':
          escapedSqlStr += '\\r';
          break;
        case '"':
          escapedSqlStr += '\\"';
          break;
        case "'":
          escapedSqlStr += "\\'";
          break;
        case '\\':
          escapedSqlStr += '\\\\';
          break;
        case '%':
          escapedSqlStr += '\\%';
          break;
        default:
          continue;
      }

      escapedSqlStr += sqlStr.slice(chunkIndex, matchChar.index);
      chunkIndex = matchChar.index + 1;
    }

    if (chunkIndex < sqlStr.length) {
      return "'" + escapedSqlStr + sqlStr.slice(chunkIndex) + "'";
    }

    return "'" + escapedSqlStr + "'";
  }
}
