import { Injectable } from '@angular/core';
import {
  FillBlankPrompt,
  FillBlankWord,
  FoodChainStep,
  MatchCardData,
  QuizQuestion,
} from '../../../models/worksheet.model';

export interface WorksheetPrintData {
  studentName: string;
  date: string;
  foodChainSteps: FoodChainStep[];
  whoAmICards: MatchCardData[];
  quizQuestions: QuizQuestion[];
  fillBlankPrompts: FillBlankPrompt[];
  fillBlankWords: FillBlankWord[];
}

@Injectable({ providedIn: 'root' })
export class WorksheetPrintService {
  private readonly letters = ['A', 'B', 'C', 'D', 'E'];

  print(data: WorksheetPrintData): void {
    const html = this.buildHtml(data);
    const win = window.open('', '_blank', 'width=900,height=720,scrollbars=yes');
    if (!win) {
      alert('Pop-ups are blocked. Please allow pop-ups for this site, then try again.');
      return;
    }
    win.onload = () => {
      win.focus();
      win.print();
    };
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  private esc(value: string | null | undefined): string {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildHtml(data: WorksheetPrintData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Food Chain – Worksheet</title>
<style>${this.css()}</style>
</head>
<body>
<div class="page">
  ${this.header(data.studentName, data.date)}
  <div class="body">
    ${this.act1(data.foodChainSteps)}
    ${this.act2(data.whoAmICards)}
    ${this.act3(data.quizQuestions)}
    ${this.act4(data.fillBlankPrompts, data.fillBlankWords)}
  </div>
</div>
</body>
</html>`;
  }

  private header(name: string, date: string): string {
    return `
<div class="hdr">
  <span class="badge">Grade 3 Science</span>
  <h1 class="title">The Food Chain</h1>
  <p class="desc">Discover how energy travels from the sun to plants and animals through a simple food chain.</p>
  <div class="fields">
    <div><p class="flbl">Student Name</p><p class="fval">${this.esc(name) || '&nbsp;'}</p></div>
    <div><p class="flbl">Date</p><p class="fval">${this.esc(date) || '&nbsp;'}</p></div>
  </div>
</div>`;
  }

  private act1(steps: FoodChainStep[]): string {
    const slots = steps
      .map(
        (_, i) => `
      <div class="slot">
        <div class="slot-n">Step ${i + 1}</div>
        <div class="slot-line"></div>
      </div>`,
      )
      .join('');

    const choices = steps
      .map(
        (s) => `
      <div class="choice">
        <span class="ch-em">${s.emoji}</span>
        <div><div class="ch-name">${this.esc(s.label)}</div><div class="ch-role">${this.esc(s.role)}</div></div>
      </div>`,
      )
      .join('');

    return `
<div class="act">
  <p class="act-lbl">Activity 1</p>
  <h2 class="act-title">Build the Food Chain</h2>
  <p class="act-sub">Write each organism in the correct step order, from energy source to top predator.</p>
  <p class="sec-lbl">Answer — write the name on each line:</p>
  <div class="slots">${slots}</div>
  <p class="sec-lbl" style="margin-top:12px">Reference cards:</p>
  <div class="choices">${choices}</div>
</div>`;
  }

  private act2(cards: MatchCardData[]): string {
    const items = cards
      .map(
        (c) => `
      <div class="mc">
        <div class="mc-hero"><div class="mc-em">${c.emoji}</div><div class="mc-name">${this.esc(c.title)}</div></div>
        <p class="mc-clue">${this.esc(c.clue)}</p>
        <div class="mc-opts">
          <div class="mc-opt"><div class="circ"></div>🌿 Producer</div>
          <div class="mc-opt"><div class="circ"></div>🐾 Consumer</div>
          <div class="mc-opt"><div class="circ"></div>🍄 Decomposer</div>
        </div>
      </div>`,
      )
      .join('');

    return `
<div class="act">
  <p class="act-lbl">Activity 2</p>
  <h2 class="act-title">Who Am I?</h2>
  <p class="act-sub">Read each clue. Circle the correct role for each mystery creature.</p>
  <div class="mc-grid">${items}</div>
</div>`;
  }

  private act3(questions: QuizQuestion[]): string {
    const items = questions
      .map(
        (q, qi) => `
      <div class="qcard">
        <div class="q-num">Question ${qi + 1}</div>
        <p class="q-prompt">${this.esc(q.prompt)}</p>
        <div class="q-opts">
          ${q.options
            .map(
              (opt, oi) => `
          <div class="q-opt">
            <span class="opt-ltr">${this.letters[oi] ?? String.fromCharCode(65 + oi)}</span>
            ${this.esc(opt.label)}
          </div>`,
            )
            .join('')}
        </div>
      </div>`,
      )
      .join('');

    return `
<div class="act">
  <p class="act-lbl">Activity 3</p>
  <h2 class="act-title">Quick Quiz</h2>
  <p class="act-sub">Circle the letter of the best answer for each question.</p>
  <div class="q-list">${items}</div>
</div>`;
  }

  private act4(prompts: FillBlankPrompt[], words: FillBlankWord[]): string {
    const chips = words.map((w) => `<span class="chip">${this.esc(w.label)}</span>`).join('');
    const rows = prompts
      .map(
        (p, i) => `
      <div class="fib-row">
        <span class="fib-n">${i + 1}.</span>
        <span>${this.esc(p.before)}</span>
        <span class="fib-blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
        <span>${this.esc(p.after)}</span>
      </div>`,
      )
      .join('');

    return `
<div class="act">
  <p class="act-lbl">Activity 4</p>
  <h2 class="act-title">Fill in the Blanks</h2>
  <p class="act-sub">Choose a word from the Word Bank to complete each sentence.</p>
  <div class="wb">
    <p class="wb-lbl">Word Bank</p>
    <div class="wb-chips">${chips}</div>
  </div>
  <div class="fib-list">${rows}</div>
</div>`;
  }

  private css(): string {
    return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1f2937;background:#f3f4f6;padding:20px}
.page{max-width:800px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12)}
/* Header */
.hdr{background:linear-gradient(135deg,#008081 0%,#203864 100%);color:#fff;padding:22px 26px 26px}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.18);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}
.title{font-size:24px;font-weight:700;margin-bottom:4px}
.desc{font-size:12px;color:rgba(255,255,255,.85);margin-bottom:14px;line-height:1.5}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;background:rgba(255,255,255,.12);border-radius:10px;padding:12px 14px}
.flbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.65);margin-bottom:4px}
.fval{font-size:13px;font-weight:600;color:#fff;border-bottom:1.5px solid rgba(255,255,255,.4);padding-bottom:4px;min-height:20px}
/* Body */
.body{padding:18px;display:flex;flex-direction:column;gap:14px}
/* Activity panel */
.act{border:2px solid #e7e7e7;border-radius:12px;padding:16px;break-inside:avoid;page-break-inside:avoid}
.act-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px}
.act-title{font-size:15px;font-weight:700;color:#1f2937;margin-bottom:3px}
.act-sub{font-size:11px;color:#6b7280;margin-bottom:12px;line-height:1.5}
.sec-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:7px}
/* A1 – food chain */
.slots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.slot{border:2px dashed #d1d5db;border-radius:8px;padding:10px;text-align:center}
.slot-n{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:4px}
.slot-line{height:22px;border-bottom:1.5px solid #374151;margin:0 8px}
.choices{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.choice{display:flex;align-items:center;gap:7px;border:1.5px solid #e7e7e7;border-radius:7px;padding:7px 9px}
.ch-em{font-size:18px}
.ch-name{font-size:12px;font-weight:700}
.ch-role{font-size:10px;color:#6b7280}
/* A2 – match cards */
.mc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.mc{border:1.5px solid #e7e7e7;border-radius:10px;padding:11px;break-inside:avoid}
.mc-hero{display:flex;align-items:center;gap:7px;margin-bottom:7px}
.mc-em{font-size:22px;width:36px;height:36px;border-radius:8px;background:#e6f2f2;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.mc-name{font-size:12px;font-weight:700}
.mc-clue{font-size:11px;color:#6b7280;margin-bottom:8px;line-height:1.45}
.mc-opts{display:flex;flex-direction:column;gap:5px}
.mc-opt{display:flex;align-items:center;gap:6px;padding:4px 8px;border:1.5px solid #e7e7e7;border-radius:6px;font-size:11px;font-weight:600}
.circ{width:13px;height:13px;border-radius:50%;border:1.5px solid #d1d5db;flex-shrink:0}
/* A3 – quiz */
.q-list{display:flex;flex-direction:column;gap:10px}
.qcard{border:1.5px solid #e7e7e7;border-radius:9px;padding:11px;break-inside:avoid}
.q-num{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:3px}
.q-prompt{font-size:12px;font-weight:700;color:#1f2937;margin-bottom:9px}
.q-opts{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.q-opt{display:flex;align-items:center;gap:6px;padding:5px 9px;border:1.5px solid #e7e7e7;border-radius:6px;font-size:11px}
.opt-ltr{width:18px;height:18px;border-radius:50%;border:1.5px solid #d1d5db;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;color:#6b7280}
/* A4 – fill blank */
.wb{background:#f9fafb;border:1.5px solid #e7e7e7;border-radius:9px;padding:10px 13px;margin-bottom:12px}
.wb-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:7px}
.wb-chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{padding:4px 12px;border:1.5px solid #d1d5db;border-radius:999px;font-size:11px;font-weight:700;background:#fff}
.fib-list{display:flex;flex-direction:column;gap:7px}
.fib-row{display:flex;align-items:center;flex-wrap:wrap;gap:5px;padding:9px 12px;border:1.5px solid #e7e7e7;border-radius:8px;font-size:12px;line-height:1.7;background:#f9fafb}
.fib-n{font-size:9px;font-weight:700;color:#9ca3af;margin-right:3px}
.fib-blank{display:inline-block;min-width:80px;border-bottom:2px solid #374151;padding:0 3px 2px;text-align:center}
/* Print */
@media print{
  body{background:#fff;padding:0}
  .page{border-radius:0;box-shadow:none}
  .act,.qcard,.mc{break-inside:avoid;page-break-inside:avoid}
}`;
  }
}
