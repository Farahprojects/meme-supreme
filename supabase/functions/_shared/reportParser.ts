
// Shared report parser that works in both frontend and Deno environments
export interface ParsedBlock {
  type: 'heading' | 'action' | 'tag' | 'spacer' | 'normal';
  text: string;
}

export class SharedReportParser {
  static cleanContent(content: string): string {
    return content
      .replace(/<[^>]*>/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/[_`]/g, '')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove ISO date formatting (YYYY-MM-DDTHH:mm:SS...) -> YYYY-MM-DD HH:mm
      .replace(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(?:[Z+-][\d:]*)?/g, '$1 $2')
      .trim();
  }

  static isHeading(line: string): boolean {
    const t = line.toLowerCase().trim();
    const h = [
      'summary', 'insights', 'actions', 'tags',
      'conclusion', 'recommendations', 'overview',
      'analysis', 'findings', 'key points', 'next steps', 'takeaways'
    ];
    return line.length < 60 && h.some(s => t === s || t === `${s}:` || t.startsWith(`${s}:`));
  }

  static processBlocks(content: string): ParsedBlock[] {
    const lines = content.split(/\r?\n/);
    const out: ParsedBlock[] = [];

    lines.forEach(raw => {
      const line = raw.trim();
      if (line === '') {
        out.push({ type: 'spacer', text: '' });
        return;
      }
      const lower = line.toLowerCase();

      if (this.isHeading(line)) {
        out.push({ type: 'heading', text: line });
        return;
      }
      if (lower.startsWith('positivetags:') || lower.startsWith('negativetags:')) {
        const lbl = lower.startsWith('positivetags:') ? 'Positive Traits' : 'Negative Traits';
        out.push({ type: 'heading', text: lbl });
        line.split(':')[1].split(',').map(t => t.trim()).filter(Boolean).forEach(tag => {
          out.push({ type: 'tag', text: `• ${tag}` });
        });
        return;
      }
      if (/^\d+\.\s/.test(line)) {
        out.push({ type: 'action', text: line });
        return;
      }
      out.push({ type: 'normal', text: line });
    });
    return out;
  }

  static parseReport(content: string): ParsedBlock[] {
    const cleaned = this.cleanContent(content);
    return this.processBlocks(cleaned);
  }
}
