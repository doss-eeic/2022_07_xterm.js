/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { ILinkProvider, ILink, Terminal, IViewportRange } from 'xterm';

export interface ILinkProviderOptions {
  hover?(event: MouseEvent, text: string, location: IViewportRange): void;
  leave?(event: MouseEvent, text: string): void;
  urlRegex?: RegExp;
}

export class WebLinkProvider implements ILinkProvider {

  constructor(
    private readonly _terminal: Terminal,
    private readonly _regex: RegExp,
    private readonly _handler: (event: MouseEvent, uri: string) => void,
    private readonly _options: ILinkProviderOptions = {}
  ) {

  }

  public provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void {
    const links = LinkComputer.computeLink(y, this._regex, this._terminal, this._handler);
    callback(this._addCallbacks(links));
  }

  private _addCallbacks(links: ILink[]): ILink[] {
    return links.map(link => {
      link.leave = this._options.leave;
      link.hover = (event: MouseEvent, uri: string): void => {
        if (this._options.hover) {
          const { range } = link;
          this._options.hover(event, uri, range);
        }
      };
      return link;
    });
  }
}

export class LinkComputer {
  public static computeLink(y: number, regex: RegExp, terminal: Terminal, activate: (event: MouseEvent, uri: string) => void): ILink[] {
    const rex = new RegExp(regex.source, (regex.flags || '') + 'g');

    const [line, startLineIndex] = LinkComputer._translateBufferLineToStringWithWrap(y - 1, false, terminal);

    let match;
    let stringIndex = -1;
    const result: ILink[] = [];

    while ((match = rex.exec(line)) !== null) {
      const text = match[1];
      if (!text) {
        // something matched but does not comply with the given matchIndex
        // since this is most likely a bug the regex itself we simply do nothing here
        console.log('match found without corresponding matchIndex');
        break;
      }

      // Get index, match.index is for the outer match which includes negated chars
      // therefore we cannot use match.index directly, instead we search the position
      // of the match group in text again
      // also correct regex and string search offsets for the next loop run
      stringIndex = line.indexOf(text, stringIndex + 1);
      rex.lastIndex = stringIndex + text.length;
      if (stringIndex < 0) {
        // invalid stringIndex (should not have happened)
        break;
      }

      let endX = stringIndex + text.length;
      let endY = startLineIndex + 1;

      while (endX > terminal.cols) {
        endX -= terminal.cols;
        endY++;
      }

      let startX = stringIndex + 1;
      let startY = startLineIndex + 1;
      while (startX > terminal.cols) {
        startX -= terminal.cols;
        startY++;
      }

      const range = {
        start: {
          x: startX,
          y: startY
        },
        end: {
          x: endX,
          y: endY
        }
      };

      result.push({ range, text, activate });
    }

    return result;
  }

  /**
   * Gets the entire line for the buffer line
   * @param lineIndex The index of the line being translated.
   * @param trimRight Whether to trim whitespace to the right.
   */
  private static _translateBufferLineToStringWithWrap(lineIndex: number, trimRight: boolean, terminal: Terminal): [string, number] {
    let lineString = '';
    let lineWrapsToNext: boolean;
    let prevLinesToWrap: boolean;

    do {
      const line = terminal.buffer.active.getLine(lineIndex);
      if (!line) {
        break;
      }

      if (line.isWrapped) {
        lineIndex--;
      }

      prevLinesToWrap = line.isWrapped;
    } while (prevLinesToWrap);

    const startLineIndex = lineIndex;

    do {
      const nextLine = terminal.buffer.active.getLine(lineIndex + 1);
      lineWrapsToNext = nextLine ? nextLine.isWrapped : false;
      const line = terminal.buffer.active.getLine(lineIndex);
      if (!line) {
        break;
      }
      lineString += line.translateToString(!lineWrapsToNext && trimRight).substring(0, terminal.cols);
      lineIndex++;
    } while (lineWrapsToNext);

    return [lineString, startLineIndex];
  }
}
