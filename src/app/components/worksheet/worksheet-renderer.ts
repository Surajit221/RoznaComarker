import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgStyle } from '@angular/common';
import {
  WorksheetDocument,
  WorksheetSection,
  HeaderContent,
  InstructionsContent,
  QuestionBlockContent,
  DiagramLabelsContent,
  WordBankContent,
  FooterContent,
  WorksheetColorScheme,
} from '../../models/worksheet-document.model';
import { HeaderSectionComponent } from './sections/header-section';
import { InstructionsSectionComponent } from './sections/instructions-section';
import { QuestionBlockSectionComponent } from './sections/question-block-section';
import { DiagramLabelsSectionComponent } from './sections/diagram-labels-section';
import { WordBankSectionComponent } from './sections/word-bank-section';
import { FooterSectionComponent } from './sections/footer-section';

@Component({
  selector: 'app-worksheet-renderer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgStyle,
    HeaderSectionComponent,
    InstructionsSectionComponent,
    QuestionBlockSectionComponent,
    DiagramLabelsSectionComponent,
    WordBankSectionComponent,
    FooterSectionComponent,
  ],
  template: `
    <div
      id="worksheet-render-root"
      class="worksheet-page"
      [ngStyle]="cssVars"
    >
      @for (section of worksheet.sections; track section.id) {
        @switch (section.type) {
          @case ('header') {
            <app-ws-header-section
              [content]="asHeader(section)"
              [colorScheme]="colorScheme"
            />
          }
          @case ('instructions') {
            <app-ws-instructions-section
              [content]="asInstructions(section)"
            />
          }
          @case ('question_block') {
            <app-ws-question-block-section
              [content]="asQuestionBlock(section)"
              [colorScheme]="colorScheme"
              [mode]="mode"
              [showAnswerKey]="showAnswerKey"
              [answerKey]="worksheet.answerKey"
            />
          }
          @case ('diagram_labels') {
            <app-ws-diagram-labels-section
              [content]="asDiagramLabels(section)"
              [colorScheme]="colorScheme"
            />
          }
          @case ('word_bank') {
            <app-ws-word-bank-section
              [content]="asWordBank(section)"
              [colorScheme]="colorScheme"
            />
          }
          @case ('footer') {
            <app-ws-footer-section
              [content]="asFooter(section)"
              [colorScheme]="colorScheme"
            />
          }
          @case ('divider') {
            <hr [style.borderColor]="colorScheme.primary" style="margin:12px 0" />
          }
        }
      }
    </div>
  `,
})
export class WorksheetRendererComponent {
  @Input({ required: true }) worksheet!: WorksheetDocument;
  @Input() mode: 'preview' | 'print' | 'student' = 'preview';
  @Input() showAnswerKey = false;

  get colorScheme(): WorksheetColorScheme {
    return this.worksheet.design.colorScheme;
  }

  /** Injects all color tokens as CSS custom properties on the root element. */
  get cssVars(): Record<string, string> {
    const c = this.colorScheme;
    return {
      '--ws-primary': c.primary,
      '--ws-primaryLight': c.primaryLight,
      '--ws-background': c.background,
      '--ws-text': c.text,
      '--ws-accent': c.accent,
      '--ws-headerBg': c.headerBg,
      '--ws-headerText': c.headerText,
      '--ws-boxBorder': c.boxBorder,
      '--ws-labelBg': c.labelBg,
      '--ws-labelText': c.labelText,
      '--ws-font': this.worksheet.design.fontFamily,
      'background': c.background,
    };
  }

  // ── Typed cast helpers (no runtime cost, just TypeScript narrowing) ────────
  asHeader(s: WorksheetSection): HeaderContent {
    return s.content as HeaderContent;
  }
  asInstructions(s: WorksheetSection): InstructionsContent {
    return s.content as InstructionsContent;
  }
  asQuestionBlock(s: WorksheetSection): QuestionBlockContent {
    return s.content as QuestionBlockContent;
  }
  asDiagramLabels(s: WorksheetSection): DiagramLabelsContent {
    return s.content as DiagramLabelsContent;
  }
  asWordBank(s: WorksheetSection): WordBankContent {
    return s.content as WordBankContent;
  }
  asFooter(s: WorksheetSection): FooterContent {
    return s.content as FooterContent;
  }
}
