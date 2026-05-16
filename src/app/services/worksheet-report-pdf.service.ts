import { Injectable } from '@angular/core';

// ─────────────────────────────────────────────────────────────────────────────
// DATA INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface WorksheetReportStats {
  totalAssigned: number;
  submitted: number;
  pending: number;
  late: number;
  completionRate: number;
  avgScore: number;
  medianScore: number;
  passRate: number;
  avgTime: number;
}

export interface ScoreDistribution {
  '90-100': number;
  '80-89': number;
  '70-79': number;
  'below70': number;
}

export interface SectionPerformance {
  id: string;
  title: string;
  type: string;
  score: number;
  completion: number;
  avgTime: number;
  questionCount: number;
  correct: number;
  incorrect: number;
  skipped: number;
  mostMissed: string[];
}

export interface StudentResult {
  name: string;
  score: number;
  time: number;
  date: string;
  status: 'On Time' | 'Late';
  dragDropScore: number;
  classificationScore: number;
  multipleChoiceScore: number;
  fillBlanksScore: number;
  matchingScore: number;
}

export interface QuestionInsight {
  name: string;
  correctPct: number;
}

export interface WeakSection {
  name: string;
  score: number;
}

export interface WorksheetReportData {
  worksheetTitle: string;
  subject: string;
  cefrLevel: string;
  gradeLevel: string;
  difficulty: string;
  theme: string;
  activities: number;
  stats: WorksheetReportStats;
  scoreDistribution: ScoreDistribution;
  teacherInsights: string[];
  sections: SectionPerformance[];
  students: StudentResult[];
  hardestQuestions: QuestionInsight[];
  easiestQuestions: QuestionInsight[];
  weakSections: WeakSection[];
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATOR SERVICE
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root',
})
export class WorksheetReportPdfService {
  private readonly COLORS = {
    primary: '#00B8A9',
    red: '#FF4D4F',
    yellow: '#FAAD14',
    green: '#52C41A',
    blue: '#1890FF',
    bgGray: '#F5F5F5',
    border: '#E8E8E8',
    dark: '#1A1A2E',
    gray: '#888888',
    white: '#FFFFFF',
  };

  private readonly FONTS = {
    body: 'Roboto',
    bold: 'Roboto',
  };

  generateWorksheetReport(reportData: WorksheetReportData): void {
    const docDefinition = this.buildDocDefinition(reportData);

    // Import pdfmake dynamically with vfs_fonts (required for proper font loading)
    Promise.all([
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts')
    ]).then(([pdfMakeModule, pdfFontsModule]) => {
      const pdfMake = pdfMakeModule.default;
      // vfs_fonts exports the vfs object directly
      (pdfMake as any).vfs = pdfFontsModule.default;

      pdfMake.createPdf(docDefinition).download('worksheet-report.pdf');
    }).catch((err) => {
      console.error('Failed to load pdfmake:', err);
      throw new Error('PDF generation library not available. Please ensure pdfmake is installed.');
    });
  }

  private buildDocDefinition(data: WorksheetReportData): any {
    return {
      content: [
        // PAGE 1
        this.buildHeader(data),
        this.buildSummaryStats(data.stats),
        this.buildScoreDistribution(data.scoreDistribution),
        this.buildTeacherInsights(data.teacherInsights),
        this.buildWorksheetDetails(data),

        // PAGE 2
        { text: 'Section Performance Analytics', style: 'sectionHeader', pageBreak: 'before' },
        this.buildSectionPerformanceGrid(data.sections),
        this.buildQuestionInsights(data.hardestQuestions, data.easiestQuestions),
        this.buildStudentPerformanceInsights(data.weakSections),
        this.buildDetailedStudentAnalysis(data),
      ],
      styles: this.getStyles(),
      defaultStyle: {
        font: this.FONTS.body,
      },
      pageMargins: [40, 40, 40, 60], // [left, top, right, bottom] - increased bottom margin
    };
  }

  private buildHeader(data: WorksheetReportData): any {
    return {
      stack: [
        {
          canvas: [
            {
              type: 'rect',
              x: 0,
              y: 0,
              w: 515,
              h: 60,
              color: this.COLORS.white,
            },
            {
              type: 'line',
              x1: 0,
              y1: 60,
              x2: 515,
              y2: 60,
              lineWidth: 2,
              lineColor: this.COLORS.primary,
            },
          ],
        },
        {
          columns: [
            {
              text: 'RoznaHub',
              style: 'brandTitle',
              width: 120,
            },
            {
              text: data.worksheetTitle,
              style: 'reportTitle',
              width: 275,
              alignment: 'center',
            },
            {
              text: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              style: 'dateText',
              width: 120,
              alignment: 'right',
            },
          ],
          margin: [40, -45, 40, 20],
        },
      ],
      margin: [0, 0, 0, 20],
    };
  }

  private buildSummaryStats(stats: WorksheetReportStats): any {
    const row1 = [
      { label: 'Total Assigned', value: stats.totalAssigned.toString() },
      { label: 'Submitted', value: stats.submitted.toString() },
      { label: 'Pending', value: stats.pending.toString() },
      { label: 'Late', value: stats.late.toString() },
      { label: 'Completion Rate', value: `${stats.completionRate}%` },
    ];

    const row2 = [
      { label: 'Average Score', value: `${stats.avgScore}%` },
      { label: 'Median Score', value: `${stats.medianScore}%` },
      { label: 'Pass Rate', value: `${stats.passRate}%` },
      { label: 'Avg Time', value: this.formatTime(stats.avgTime) },
      { label: '', value: '' }, // Empty to balance grid
    ];

    return {
      stack: [
        {
          text: 'Summary Statistics',
          style: 'subsectionHeader',
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            body: [
              row1.map(stat => this.buildStatCell(stat.label, stat.value)),
              row2.map(stat => this.buildStatCell(stat.label, stat.value)),
            ],
            widths: [103, 103, 103, 103, 103],
          },
          layout: 'noBorders',
        },
      ],
      margin: [40, 0, 40, 20],
    };
  }

  private buildStatCell(label: string, value: string): any {
    return [
      {
        stack: [
          { text: label, style: 'statLabel' },
          { text: value, style: 'statValue' },
        ],
        margin: [6, 8, 6, 8],
      },
    ];
  }

  private buildScoreDistribution(distribution: ScoreDistribution): any {
    const bands = [
      { label: '90–100%', count: distribution['90-100'], color: this.COLORS.green },
      { label: '80–89%', count: distribution['80-89'], color: this.COLORS.blue },
      { label: '70–79%', count: distribution['70-79'], color: this.COLORS.yellow },
      { label: 'Below 70%', count: distribution.below70, color: this.COLORS.red },
    ];

    const maxCount = Math.max(...bands.map(b => b.count), 1);

    return {
      stack: [
        {
          text: 'Score Distribution',
          style: 'subsectionHeader',
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            body: bands.map(band => [
              {
                text: band.label,
                style: 'distLabel',
                width: 80,
              },
              {
                canvas: [
                  {
                    type: 'rect',
                    x: 0,
                    y: 0,
                    w: (band.count / maxCount) * 300,
                    h: 20,
                    color: band.color,
                  },
                ],
                margin: [0, 2, 0, 2],
              },
              {
                text: band.count.toString(),
                style: 'distCount',
                width: 40,
                alignment: 'right',
              },
            ]),
            widths: [80, '*', 40],
          },
          layout: 'noBorders',
        },
      ],
      margin: [40, 0, 40, 20],
    };
  }

  private buildTeacherInsights(insights: string[]): any {
    return {
      stack: [
        {
          text: 'Teacher Insights',
          style: 'subsectionHeader',
          margin: [0, 0, 0, 12],
        },
        {
          canvas: [
            {
              type: 'rect',
              x: 40,
              y: 0,
              w: 435,
              h: insights.length * 24 + 16,
              color: '#E3F2FD',
            },
          ],
        },
        {
          ul: insights,
          style: 'insightText',
          margin: [50, 8, 40, 8],
        },
      ],
      margin: [0, 0, 0, 20],
    };
  }

  private buildWorksheetDetails(data: WorksheetReportData): any {
    return {
      stack: [
        {
          text: 'Worksheet Details',
          style: 'subsectionHeader',
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            body: [
              [
                { text: 'Subject', style: 'detailLabel' },
                { text: data.subject, style: 'detailValue' },
                { text: 'CEFR Level', style: 'detailLabel' },
                { text: data.cefrLevel, style: 'detailValue' },
              ],
              [
                { text: 'Grade Level', style: 'detailLabel' },
                { text: data.gradeLevel, style: 'detailValue' },
                { text: 'Difficulty', style: 'detailLabel' },
                { text: data.difficulty || 'N/A', style: 'detailValue' },
              ],
              [
                { text: 'Theme', style: 'detailLabel' },
                { text: data.theme, style: 'detailValue' },
                { text: 'Activities', style: 'detailLabel' },
                { text: `${data.activities} sections`, style: 'detailValue' },
              ],
            ],
            widths: [100, '*', 100, '*'],
          },
          layout: 'noBorders',
        },
      ],
      margin: [40, 0, 40, 20],
    };
  }

  private buildSectionPerformanceGrid(sections: SectionPerformance[]): any {
    const rows: any[][] = [];
    for (let i = 0; i < sections.length; i += 2) {
      const row = sections.slice(i, i + 2).map(section => this.buildSectionCard(section));
      while (row.length < 2) {
        row.push({ text: '', border: [false, false, false, false] });
      }
      rows.push(row);
    }

    return {
      stack: [
        {
          table: {
            body: rows,
            widths: [247, 248],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
          },
        },
      ],
      margin: [40, 0, 40, 20],
    };
  }

  private buildSectionCard(section: SectionPerformance): any {
    return {
      stack: [
        {
          columns: [
            {
              text: section.title,
              style: 'cardTitle',
              width: '*',
            },
            {
              text: 'ACTIVITY',
              style: 'cardBadge',
              width: 'auto',
              background: this.COLORS.primary,
              color: this.COLORS.white,
            },
          ],
          margin: [0, 0, 0, 8],
        },
        {
          text: `${section.score}%`,
          style: 'cardScore',
          color: section.score >= 70 ? this.COLORS.green : section.score >= 50 ? this.COLORS.yellow : this.COLORS.red,
        },
        {
          columns: [
            { text: `Completion: ${section.completion}%`, style: 'cardStat' },
            { text: `Avg Time: ${this.formatTime(section.avgTime)}`, style: 'cardStat' },
            { text: `${section.questionCount} questions`, style: 'cardStat', alignment: 'right' },
          ],
          margin: [0, 4, 0, 8],
        },
        {
          columns: [
            this.buildPill('CORRECT', section.correct, this.COLORS.green),
            this.buildPill('INCORRECT', section.incorrect, this.COLORS.red),
            this.buildPill('SKIPPED', section.skipped, this.COLORS.yellow),
          ],
          margin: [0, 0, 0, 8],
        },
        section.mostMissed.length > 0 ? {
          text: `Most Missed: ${section.mostMissed.join(', ')}`,
          style: 'cardMissed',
        } : null,
      ].filter(Boolean),
      margin: 8,
      border: [true, true, true, true],
      borderColor: this.COLORS.border,
    };
  }

  private buildPill(label: string, count: number, color: string): any {
    return {
      text: `${label}: ${count}`,
      style: 'pill',
      background: color,
      color: this.COLORS.white,
      margin: [0, 0, 4, 0],
    };
  }

  private buildQuestionInsights(hardest: QuestionInsight[], easiest: QuestionInsight[]): any {
    return {
      stack: [
        {
          text: 'Question Insights',
          style: 'subsectionHeader',
          margin: [0, 0, 0, 12],
        },
        {
          columns: [
            {
              stack: [
                { text: '🔴 Hardest Questions', style: 'insightSectionTitle' },
                ...hardest.slice(0, 5).map(q => ({
                  text: `${q.name} — ${q.correctPct}% correct`,
                  style: 'insightItem',
                })),
              ],
              width: 250,
            },
            {
              stack: [
                { text: '🟢 Easiest Questions', style: 'insightSectionTitle' },
                ...easiest.slice(0, 5).map(q => ({
                  text: `${q.name} — ${q.correctPct}% correct`,
                  style: 'insightItem',
                })),
              ],
              width: 250,
            },
          ],
        },
      ],
      margin: [40, 0, 40, 20],
    };
  }

  private buildStudentPerformanceInsights(weakSections: WeakSection[]): any {
    return {
      stack: [
        {
          text: 'Student Performance Insights',
          style: 'subsectionHeader',
          margin: [0, 0, 0, 12],
        },
        {
          canvas: [
            {
              type: 'rect',
              x: 40,
              y: 0,
              w: 435,
              h: weakSections.length * 24 + 16,
              color: '#FFF1F0',
            },
          ],
        },
        {
          text: 'Weak Sections (Need Attention)',
          style: 'weakSectionTitle',
          margin: [50, 8, 40, 4],
        },
        ...weakSections.map(section => ({
          text: `• ${section.name} — ${section.score}%`,
          style: 'weakSectionItem',
          margin: [50, 0, 40, 0],
        })),
      ],
      margin: [0, 0, 0, 20],
    };
  }

  private buildDetailedStudentAnalysis(data: WorksheetReportData): any {
    const stats = data.stats;
    const summaryRow = [
      { text: `Average Score ${stats.avgScore}%`, style: 'summaryStat' },
      { text: `Median ${stats.medianScore}%`, style: 'summaryStat' },
      { text: `Highest ${Math.max(...data.students.map(s => s.score))}%`, style: 'summaryStat' },
      { text: `Lowest ${Math.min(...data.students.map(s => s.score))}%`, style: 'summaryStat' },
      { text: `Passed ${data.students.filter(s => s.score >= 70).length}`, style: 'summaryStat' },
      { text: `Below Threshold ${data.students.filter(s => s.score < 70).length}`, style: 'summaryStat' },
      { text: `Total Time ${this.formatTime(stats.avgTime * data.students.length)}`, style: 'summaryStat' },
      { text: `Pass Rate ${stats.passRate}%`, style: 'summaryStat' },
    ];

    const passedCount = data.students.filter(s => s.score >= 70).length;
    const failedCount = data.students.length - passedCount;

    return {
      stack: [
        {
          text: 'Detailed Student Analysis',
          style: 'subsectionHeader',
          margin: [0, 0, 0, 12],
        },
        
        // Summary row
        {
          text: summaryRow.map(s => s.text).join(' | '),
          style: 'summaryRow',
          margin: [40, 0, 40, 12],
        },

        // Pass/Fail breakdown
        {
          text: 'Pass/Fail Breakdown',
          style: 'subSubsectionHeader',
          margin: [40, 0, 40, 8],
        },
        {
          canvas: [
            {
              type: 'rect',
              x: 40,
              y: 0,
              w: passedCount > 0 ? (passedCount / data.students.length) * 435 : 0,
              h: 24,
              color: this.COLORS.green,
            },
            {
              type: 'rect',
              x: 40 + (passedCount / data.students.length) * 435,
              y: 0,
              w: failedCount > 0 ? (failedCount / data.students.length) * 435 : 435,
              h: 24,
              color: this.COLORS.red,
            },
          ],
          margin: [40, 0, 40, 8],
        },
        {
          text: `Passed (${passedCount}) | Below threshold (${failedCount})`,
          style: 'legend',
          margin: [40, 0, 40, 16],
        },

        // Score distribution table
        {
          text: 'Score Distribution',
          style: 'subSubsectionHeader',
          margin: [40, 0, 40, 8],
        },
        this.buildScoreDistributionTable(data.scoreDistribution),

        // Top performers vs needs attention
        {
          columns: [
            {
              stack: [
                { text: 'Top Performers', style: 'subSubsectionHeader' },
                this.buildStudentTable(data.students.filter(s => s.score >= 70).slice(0, 5)),
              ],
              width: 250,
            },
            {
              stack: [
                { text: 'Needs Attention', style: 'subSubsectionHeader' },
                this.buildStudentTable(data.students.filter(s => s.score < 70).slice(0, 5)),
              ],
              width: 250,
            },
          ],
          margin: [40, 0, 40, 16],
        },

        // Full student results table
        {
          text: 'Student Results',
          style: 'subSubsectionHeader',
          margin: [40, 0, 40, 8],
        },
        this.buildFullStudentResultsTable(data.students),
      ],
      margin: [0, 0, 0, 20],
    };
  }

  private buildScoreDistributionTable(distribution: ScoreDistribution): any {
    const bands = [
      { label: '0–20%', count: distribution.below70 }, // Simplified for demo
      { label: '21–40%', count: 0 },
      { label: '41–60%', count: 0 },
      { label: '61–80%', count: distribution['70-79'] },
      { label: '81–100%', count: distribution['90-100'] + distribution['80-89'] },
    ];

    const maxCount = Math.max(...bands.map(b => b.count), 1);

    return {
      table: {
        body: [
          bands.map(band => [
            { text: band.label, style: 'tableCell' },
            {
              canvas: [
                {
                  type: 'rect',
                  x: 0,
                  y: 0,
                  w: (band.count / maxCount) * 200,
                  h: 12,
                  color: this.COLORS.primary,
                },
              ],
              margin: [4, 2, 4, 2],
            },
            { text: band.count.toString(), style: 'tableCell', alignment: 'right' },
          ]),
        ],
        widths: [60, '*', 40],
      },
      layout: 'noBorders',
      margin: [40, 0, 40, 16],
    };
  }

  private buildStudentTable(students: StudentResult[]): any {
    if (students.length === 0) {
      return { text: 'No students in this category', style: 'emptyText', margin: [0, 0, 0, 8] };
    }

    return {
      table: {
        body: [
          [
            { text: '#', style: 'tableHeader' },
            { text: 'Student', style: 'tableHeader' },
            { text: 'Score', style: 'tableHeader' },
            { text: 'Time', style: 'tableHeader' },
          ],
          ...students.map((s, i) => [
            { text: (i + 1).toString(), style: 'tableCell' },
            { text: s.name, style: 'tableCell' },
            { text: `${s.score}%`, style: 'tableCell' },
            { text: this.formatTime(s.time), style: 'tableCell' },
          ]),
        ],
        widths: [30, '*', 50, 50],
      },
      layout: 'noBorders',
    };
  }

  private buildFullStudentResultsTable(students: StudentResult[]): any {
    return {
      table: {
        body: [
          [
            { text: 'Student', style: 'tableHeader' },
            { text: 'Score', style: 'tableHeader' },
            { text: 'Time', style: 'tableHeader' },
            { text: 'Date', style: 'tableHeader' },
            { text: 'Status', style: 'tableHeader' },
            { text: 'Drag&Drop', style: 'tableHeader' },
            { text: 'Classification', style: 'tableHeader' },
            { text: 'Multiple Choice', style: 'tableHeader' },
            { text: 'Fill Blanks', style: 'tableHeader' },
            { text: 'Matching', style: 'tableHeader' },
          ],
          ...students.map(s => [
            { text: s.name, style: 'tableCell' },
            { text: `${s.score}%`, style: 'tableCell' },
            { text: this.formatTime(s.time), style: 'tableCell' },
            { text: s.date, style: 'tableCell' },
            { text: s.status, style: 'tableCell' },
            { text: `${s.dragDropScore}%`, style: 'tableCell' },
            { text: `${s.classificationScore}%`, style: 'tableCell' },
            { text: `${s.multipleChoiceScore}%`, style: 'tableCell' },
            { text: `${s.fillBlanksScore}%`, style: 'tableCell' },
            { text: `${s.matchingScore}%`, style: 'tableCell' },
          ]),
        ],
        widths: [120, 50, 50, 80, 50, 50, 50, 50, 50, 50],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => this.COLORS.border,
      },
      margin: [40, 0, 40, 0],
    };
  }

  private formatTime(seconds: number): string {
    if (seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remMin = m % 60;
      return `${h}h ${remMin}m`;
    }
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  private getStyles(): any {
    return {
      brandTitle: {
        fontSize: 18,
        bold: true,
        color: this.COLORS.primary,
      },
      reportTitle: {
        fontSize: 16,
        bold: true,
        color: this.COLORS.dark,
      },
      dateText: {
        fontSize: 10,
        color: this.COLORS.gray,
      },
      sectionHeader: {
        fontSize: 13,
        bold: true,
        color: this.COLORS.dark,
        margin: [0, 20, 0, 12],
      },
      subsectionHeader: {
        fontSize: 13,
        bold: true,
        color: this.COLORS.dark,
      },
      subSubsectionHeader: {
        fontSize: 11,
        bold: true,
        color: this.COLORS.dark,
      },
      statLabel: {
        fontSize: 8,
        color: this.COLORS.gray,
      },
      statValue: {
        fontSize: 18,
        bold: true,
        color: this.COLORS.dark,
        margin: [0, 2, 0, 0],
      },
      distLabel: {
        fontSize: 9,
        color: this.COLORS.dark,
      },
      distCount: {
        fontSize: 9,
        bold: true,
        color: this.COLORS.dark,
      },
      insightText: {
        fontSize: 10,
        color: this.COLORS.dark,
      },
      detailLabel: {
        fontSize: 9,
        color: this.COLORS.gray,
      },
      detailValue: {
        fontSize: 10,
        bold: true,
        color: this.COLORS.dark,
      },
      cardTitle: {
        fontSize: 10,
        bold: true,
        color: this.COLORS.dark,
      },
      cardBadge: {
        fontSize: 7,
        bold: true,
      },
      cardScore: {
        fontSize: 20,
        bold: true,
      },
      cardStat: {
        fontSize: 8,
        color: this.COLORS.gray,
      },
      pill: {
        fontSize: 7,
        bold: true,
      },
      cardMissed: {
        fontSize: 8,
        color: this.COLORS.gray,
        italics: true,
      },
      insightSectionTitle: {
        fontSize: 11,
        bold: true,
        color: this.COLORS.dark,
        margin: [0, 0, 0, 8],
      },
      insightItem: {
        fontSize: 9,
        color: this.COLORS.dark,
        margin: [0, 0, 0, 4],
      },
      weakSectionTitle: {
        fontSize: 10,
        bold: true,
        color: this.COLORS.red,
      },
      weakSectionItem: {
        fontSize: 9,
        color: this.COLORS.dark,
      },
      summaryRow: {
        fontSize: 9,
        color: this.COLORS.dark,
      },
      summaryStat: {
        fontSize: 9,
        color: this.COLORS.dark,
      },
      legend: {
        fontSize: 9,
        color: this.COLORS.gray,
      },
      tableHeader: {
        fontSize: 9,
        bold: true,
        color: this.COLORS.dark,
      },
      tableCell: {
        fontSize: 9,
        color: this.COLORS.dark,
      },
      emptyText: {
        fontSize: 9,
        color: this.COLORS.gray,
        italics: true,
      },
    };
  }
}
